/**
 * The clinical reasoning layer.
 *
 * Two jobs, both genuinely hard to do with rules:
 *
 *  1. BANKING — decide what to ask the patient to say next. This is the
 *     difference between a 1,600-sentence chore and a twenty-minute
 *     conversation: interleave phonetically-useful sentences (chosen to cover
 *     what the corpus is still missing) with personal message prompts that are
 *     worth the person's remaining voice.
 *
 *  2. DECODING — take an utterance a listener couldn't parse, plus the closest
 *     phrases from that person's own banked library, and propose what they
 *     most likely meant and how to respond. This is the half that serves the
 *     people *around* the patient.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Coverage } from './phonetics';
import type { PhraseMatch } from './moss';
import { ESSENTIALS, renderEssential, type Essential } from './essentials';

const API_KEY = process.env.ANTHROPIC_API_KEY;

export const claudeConfigured = Boolean(API_KEY);

const MODEL = 'claude-opus-5';

const globalCache = globalThis as typeof globalThis & {
  __cadenceAnthropic?: Anthropic;
};

function client() {
  if (!API_KEY) return null;
  // Reuse the SDK client (and its HTTP connection pool) on warm serverless
  // instances instead of rebuilding it for every decode, profile, or answer.
  return (globalCache.__cadenceAnthropic ??= new Anthropic({ apiKey: API_KEY }));
}

// ---------------------------------------------------------------------------
// 1. Next banking prompt
// ---------------------------------------------------------------------------

export type BankingPrompt = {
  kind: 'phonetic' | 'message';
  /** Exactly what the agent says out loud. */
  spoken: string;
  /** For deck prompts, the everyday phrase to say verbatim. */
  sentence?: string;
  /** Which entry in the essentials deck this is. */
  essentialId?: string;
  /** For message prompts, who it's for and when it would be played. */
  recipient?: string;
  occasion?: string;
  /** Why this prompt, now — shown in the clinician-facing panel. */
  rationale: string;
  /** True when the corpus is good enough to stop. */
  sessionComplete: boolean;
};

export async function nextBankingPrompt(input: {
  patientName: string;
  diagnosis: string;
  coverage: Coverage;
  banked: { kind: string; text: string; recipient?: string; occasion?: string }[];
  /** Deck ids already recorded, so the agent never asks for one twice. */
  bankedEssentialIds: string[];
}): Promise<BankingPrompt> {
  const done = new Set(input.bankedEssentialIds);
  const remaining = ESSENTIALS.filter((e) => !done.has(e.id));
  const messages = input.banked.filter((b) => b.kind === 'message');

  // The next everyday phrase is a fixed data lookup, not a reasoning task.
  // Calling an LLM here made every take wait ~8 seconds just to select the
  // next deck item. Keep the model for decoding and safety-critical reply
  // shortlists; advance the known deck locally in single-digit milliseconds.
  const shouldBankMessage =
    remaining.length > 0 && messages.length < Math.floor(input.bankedEssentialIds.length / 4);

  if (shouldBankMessage) return personalMessagePrompt(messages.length);
  return deckPrompt(remaining[0], input.patientName, messages.length, remaining.length);
}

/** Deck order, no model call. Used as the fallback and without an API key. */
function deckPrompt(
  essential: Essential | undefined,
  patientName: string,
  messageCount: number,
  remainingCount: number
): BankingPrompt {
  if (!essential) {
    return {
      kind: 'message',
      spoken: 'The deck is done. Tell me something you would want your family to hear on a hard day.',
      recipient: 'family',
      occasion: 'a hard day',
      rationale: 'Every everyday phrase is banked — the rest of the session is personal messages.',
      sessionComplete: messageCount >= 4,
    };
  }

  return {
    kind: 'phonetic',
    spoken: 'Here is the next one. Say it the way you would say it to someone in the room.',
    essentialId: essential.id,
    sentence: renderEssential(essential, patientName),
    recipient: '',
    occasion: '',
    rationale: `${essential.category} · ${remainingCount} of ${ESSENTIALS.length} phrases left to bank.`,
    sessionComplete: false,
  };
}

/** A short, varied break after every four practical phrases — no model wait. */
function personalMessagePrompt(messageCount: number): BankingPrompt {
  const prompts = [
    {
      spoken: 'Take a moment for someone close to you. What would you want them to hear in your voice on a hard day?',
      recipient: 'someone close to me',
      occasion: 'a hard day',
    },
    {
      spoken: 'Now record the way you would answer the phone for someone you love.',
      recipient: 'family or friends',
      occasion: 'a phone call',
    },
    {
      spoken: 'Think of a future milestone. Say what you would want that person to hear then.',
      recipient: 'someone I love',
      occasion: 'a future milestone',
    },
    {
      spoken: 'Record a small message that only your family would recognise as you.',
      recipient: 'family',
      occasion: 'a familiar moment',
    },
  ];
  const choice = prompts[messageCount % prompts.length];

  return {
    kind: 'message',
    spoken: choice.spoken,
    recipient: choice.recipient,
    occasion: choice.occasion,
    rationale: 'A personal message break between everyday phrases — saved in their real voice.',
    sessionComplete: false,
  };
}

// ---------------------------------------------------------------------------
// 2. Decode an utterance (the VOCA half)
// ---------------------------------------------------------------------------

export type Decoding = {
  /** Most likely meaning, in plain language. */
  interpretation: string;
  confidence: 'high' | 'medium' | 'low';
  /** Other readings worth checking, so the listener doesn't lock in too early. */
  alternatives: string[];
  /** A concrete thing the listener can say back. */
  suggestedResponse: string;
  /** Which banked phrase ids informed this, so the UI can cite them. */
  groundedIn: string[];
  /** Set when the listener should just play a banked recording instead. */
  playBackMediaId?: string;
};

const DECODE_SCHEMA = {
  type: 'object',
  properties: {
    interpretation: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    alternatives: { type: 'array', items: { type: 'string' } },
    suggestedResponse: { type: 'string' },
    groundedIn: { type: 'array', items: { type: 'string' } },
    playBackMediaId: { type: 'string' },
  },
  required: [
    'interpretation',
    'confidence',
    'alternatives',
    'suggestedResponse',
    'groundedIn',
    'playBackMediaId',
  ],
  additionalProperties: false,
} as const;

const DECODE_SYSTEM = `You help someone understand a person whose speech has become hard to parse \
— late-stage ALS, post-laryngectomy, severe dysarthria or aphasia. The listener might be family, \
or a nurse meeting them for the first time.

You are given a rough transcription of what was just said, and the closest matches from that \
person's OWN banked phrase library — recordings they made back when they could still speak clearly.

The phrase library is your evidence. Someone who banked "tell Maya I'm proud of her" is far more \
likely to be reaching for that again than for a phrase they have never used. Weight the matches by \
their score, but do not force a match: if nothing in the library fits, say so and read the \
transcription on its own terms.

Some matches are marked CONFIRMED: a caregiver previously heard that utterance and confirmed what \
it meant. Those are the strongest evidence you have — this person has been observed saying exactly \
this, and someone who was there established the meaning. A close CONFIRMED match should usually \
win over a higher-scoring banked phrase, and it justifies higher confidence than you would \
otherwise give.

Be calibrated and be honest. 'low' confidence is the correct answer more often than people like. \
A confident wrong guess is worse than an admitted uncertainty — the listener will act on what you \
say, and getting it wrong means this person is misunderstood again by someone who was trying.

suggestedResponse must be a specific sentence the listener can say out loud. Prefer a check-back \
that is easy to answer yes or no when confidence is not high.

Set playBackMediaId to a match's mediaId only when the person is very likely reaching for that \
exact banked message and hearing it in their own voice would serve them. Otherwise empty string.

Always populate every field; use an empty string or empty array where nothing applies.`;

export async function decodeUtterance(input: {
  transcript: string;
  matches: PhraseMatch[];
  context?: string;
}): Promise<Decoding> {
  const c = client();
  if (!c) return fallbackDecoding(input.transcript, input.matches);

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: DECODE_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: DECODE_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `What the listener heard (rough transcription): "${input.transcript}"`,
          input.context ? `Situation: ${input.context}` : '',
          ``,
          `Closest phrases from this person's banked library:`,
          input.matches.length
            ? input.matches
                .map(
                  (m) =>
                    `- id=${m.id} score=${m.score.toFixed(3)} mediaId=${m.mediaId ?? ''} ` +
                    `[${m.kind}${m.recipient ? ` / for ${m.recipient}` : ''}${m.occasion ? ` / ${m.occasion}` : ''}] "${m.text}"` +
                    (m.meaning ? ` — CONFIRMED to mean: "${m.meaning}"` : '')
                )
                .join('\n')
            : '- (library is empty or returned no matches)',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });

  return parseJson<Decoding>(response) ?? fallbackDecoding(input.transcript, input.matches);
}

// ---------------------------------------------------------------------------
// 3. Answering for them
// ---------------------------------------------------------------------------

export type AnswerSuggestion = {
  /** Recordings worth offering, best first. Empty when nothing fits. */
  recordingIds: string[];
  /**
   * The one recording safe to play without being asked — set only when the
   * question has a single possible honest answer. Empty otherwise.
   */
  autoplayId: string;
  /** One short line for whoever is holding the screen. */
  rationale: string;
};

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    recordingIds: { type: 'array', items: { type: 'string' } },
    autoplayId: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['recordingIds', 'autoplayId', 'rationale'],
  additionalProperties: false,
} as const;

const ANSWER_SYSTEM = `Someone has just asked a question out loud to a person who cannot speak. \
That person has a library of sentences recorded in their own voice, from before they lost speech.

Your job is to narrow that library down to the handful of replies worth offering, so they can pick \
one with a single tap instead of hunting through thirty. You are not writing anything. You are \
shortlisting.

Two separate decisions:

recordingIds — up to three replies that would make sense here, best first. Be generous: an option \
they don't want costs one ignored button. Include both sides of a yes/no question when both are \
banked, because you cannot know which is true and they can.

autoplayId — the one reply that plays immediately, without waiting for a tap. This is a much \
higher bar. Set it only when the question has exactly one honest answer that does not depend on \
how they feel: "what's your name?" has one answer, "are you in pain?" does not. When in doubt \
leave it empty — a wrong answer played aloud in their own voice, in front of the person who \
asked, is words put in their mouth.

Rules:
- Use recordingIds exactly as given. Never invent one.
- Return an empty list when nothing in the library is relevant. Don't reach for something merely \
on-topic: "I'm in pain" is not a reply to "did you sleep well?"
- rationale is for the person holding the screen, and is one short line.`;

export async function suggestAnswers(input: {
  question: string;
  candidates: { recordingId: string; answer: string; asks: string }[];
}): Promise<AnswerSuggestion> {
  const c = client();
  if (!c) {
    return {
      recordingIds: input.candidates.slice(0, 3).map((x) => x.recordingId),
      autoplayId: '',
      rationale: 'Closest banked replies — set ANTHROPIC_API_KEY for a considered shortlist.',
    };
  }

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: ANSWER_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ANSWER_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `Question just asked: "${input.question}"`,
          ``,
          `Recordings available, with the sorts of question each was banked to answer:`,
          input.candidates.length
            ? input.candidates
                .map((x) => `- recordingId=${x.recordingId} says "${x.answer}" (answers: ${x.asks})`)
                .join('\n')
            : '- nothing banked',
          ``,
          `Which should be offered, and is any of them safe to play unprompted?`,
        ].join('\n'),
      },
    ],
  });

  return (
    parseJson<AnswerSuggestion>(response) ?? {
      recordingIds: [],
      autoplayId: '',
      rationale: 'Could not shortlist safely.',
    }
  );
}

// ---------------------------------------------------------------------------
// 4. The communication profile
// ---------------------------------------------------------------------------

export type CommunicationProfile = {
  /** Who this person is as a communicator, for someone meeting them today. */
  summary: string;
  /** Practical, specific things to do when talking with them. */
  howTo: string[];
  /** What they actually talk about, with their own words as evidence. */
  themes: { name: string; examples: string[] }[];
  /** The people who recur in what they banked, and what to know about each. */
  people: { name: string; note: string }[];
  /** Honest statement of what this profile cannot tell you. */
  limits: string;
};

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    howTo: { type: 'array', items: { type: 'string' } },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          examples: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'examples'],
        additionalProperties: false,
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, note: { type: 'string' } },
        required: ['name', 'note'],
        additionalProperties: false,
      },
    },
    limits: { type: 'string' },
  },
  required: ['summary', 'howTo', 'themes', 'people', 'limits'],
  additionalProperties: false,
} as const;

const PROFILE_SYSTEM = `You write the communication profile for someone whose speech has become \
hard to understand — late-stage ALS, post-laryngectomy, severe dysarthria or aphasia.

Your reader is a person who does not know them: a night nurse on their first shift, a new aide, a \
respite carer, an ER doctor at 3am. They have two minutes. What you write decides whether this \
person gets understood today.

Your evidence is two things: the phrases this person banked in their own voice back when they \
could still speak clearly, and any utterances a caregiver has since heard and confirmed the \
meaning of. That is all you know. Everything you write must be traceable to it.

The point is not to replace how they communicate. It is to describe how they ALREADY communicate \
so someone else can meet them there — their vocabulary, who they mention, what they return to, the \
way they phrase things.

Rules:
- Be specific and concrete. "She calls her daughter Maya, never 'my daughter'" is useful. "She \
values family" is worthless.
- Quote their actual words as evidence. That is what makes this trustworthy rather than a summary.
- howTo entries are practical instructions a stranger can act on in the next five minutes.
- Never speculate about medical status, prognosis, or feelings they did not express.
- Do not be sentimental. This is a working document, not a tribute.
- 'limits' must plainly say what this profile can't tell the reader — a small library means a \
partial picture, and a stranger acting on an overconfident profile is the failure mode here.
- Always populate every field; use an empty array where nothing applies.`;

export async function buildCommunicationProfile(input: {
  patientName: string;
  phrases: { text: string; kind: string; recipient?: string; occasion?: string }[];
  observed: { heard: string; meaning: string; situation?: string }[];
}): Promise<CommunicationProfile> {
  const c = client();
  if (!c) return fallbackProfile(input.patientName, input.phrases.length);

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: PROFILE_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: PROFILE_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `Person: ${input.patientName}`,
          ``,
          `Phrases they banked in their own voice (${input.phrases.length}):`,
          input.phrases.length
            ? input.phrases
                .map(
                  (p) =>
                    `- [${p.kind}${p.recipient ? ` / for ${p.recipient}` : ''}${p.occasion ? ` / ${p.occasion}` : ''}] "${p.text}"`
                )
                .join('\n')
            : '- none yet',
          ``,
          `Utterances a caregiver has heard since, with the meaning they confirmed (${input.observed.length}):`,
          input.observed.length
            ? input.observed
                .map(
                  (o) =>
                    `- heard "${o.heard}" → meant "${o.meaning}"${o.situation ? ` (${o.situation})` : ''}`
                )
                .join('\n')
            : '- none yet',
          ``,
          `Write the profile.`,
        ].join('\n'),
      },
    ],
  });

  return parseJson<CommunicationProfile>(response) ?? fallbackProfile(input.patientName, input.phrases.length);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(response: Anthropic.Message): T | null {
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return null;
  try {
    return JSON.parse(text.text) as T;
  } catch {
    return null;
  }
}

function fallbackProfile(patientName: string, phraseCount: number): CommunicationProfile {
  return {
    summary: `${patientName} has ${phraseCount} phrases banked in their own voice. Set ANTHROPIC_API_KEY to generate the written profile from them.`,
    howTo: [
      'Read the phrase book below — those are their actual words.',
      'When you cannot parse something, use the decoder rather than guessing.',
      'Confirm what you understood before acting on it.',
    ],
    themes: [],
    people: [],
    limits: 'Stub profile — no reasoning layer configured.',
  };
}

function fallbackDecoding(transcript: string, matches: PhraseMatch[]): Decoding {
  const best = matches[0];
  return {
    interpretation: best
      ? `Possibly reaching for a banked phrase: "${best.text}"`
      : `Heard: "${transcript}" — no close match in the banked library.`,
    confidence: 'low',
    alternatives: matches.slice(1, 3).map((m) => m.text),
    suggestedResponse: best
      ? `Ask directly: "Did you mean — ${best.text}?"`
      : 'Ask them to repeat it, or to point to the first letter.',
    groundedIn: matches.slice(0, 3).map((m) => m.id),
    playBackMediaId: best?.mediaId,
  };
}
