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

const API_KEY = process.env.ANTHROPIC_API_KEY;

export const claudeConfigured = Boolean(API_KEY);

const MODEL = 'claude-opus-5';

function client() {
  if (!API_KEY) return null;
  return new Anthropic({ apiKey: API_KEY });
}

// ---------------------------------------------------------------------------
// 1. Next banking prompt
// ---------------------------------------------------------------------------

export type BankingPrompt = {
  kind: 'phonetic' | 'message';
  /** Exactly what the agent says out loud. */
  spoken: string;
  /** For phonetic prompts, the sentence to read verbatim. */
  sentence?: string;
  /** For message prompts, who it's for and when it would be played. */
  recipient?: string;
  occasion?: string;
  /** Why this prompt, now — shown in the clinician-facing panel. */
  rationale: string;
  /** True when the corpus is good enough to stop. */
  sessionComplete: boolean;
};

const BANKING_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['phonetic', 'message'] },
    spoken: { type: 'string' },
    sentence: { type: 'string' },
    recipient: { type: 'string' },
    occasion: { type: 'string' },
    rationale: { type: 'string' },
    sessionComplete: { type: 'boolean' },
  },
  required: ['kind', 'spoken', 'sentence', 'recipient', 'occasion', 'rationale', 'sessionComplete'],
  additionalProperties: false,
} as const;

const BANKING_SYSTEM = `You are the voice of a guided voice-banking session, run with someone \
who has just been diagnosed with a condition that will take their speech — most often ALS, or a \
scheduled laryngectomy for head and neck cancer. They can still speak today. That is the entire \
reason this session exists, and it is why it cannot be a chore.

You are choosing what they say next. Two kinds of prompt, interleaved:

PHONETIC — a sentence to read aloud, chosen to cover phonemes the corpus is still missing. Keep \
them short (8-14 words), natural to say, and never clinical or morbid. Never mention phonemes to \
the patient; that is the clinician's view, not theirs.

MESSAGE — a personal message banked verbatim in their real voice, to be played back for years. \
These are the point. Draw on what they have already banked so prompts build on each other rather \
than repeating. Ask for specific, situated things — a message for a daughter's wedding day, the \
way they answer the phone, a bedtime story, an in-joke, what they'd want said on a hard day — not \
generic sentiment. Vary the recipient and the occasion.

Rules:
- 'spoken' is exactly what the agent says out loud. Warm, unhurried, never saccharine, never \
performatively sad. Short. You are a professional doing something that matters, not a greeting card.
- Do not congratulate them, do not thank them for sharing, do not remark on how meaningful this is.
- Roughly one message prompt for every two phonetic prompts, but weight toward messages once \
phoneme coverage is past 85%.
- Set sessionComplete true only when coverage is at or above 92% AND at least four messages are banked.
- Always populate every field. Use an empty string for fields that do not apply to this prompt kind.`;

export async function nextBankingPrompt(input: {
  patientName: string;
  diagnosis: string;
  coverage: Coverage;
  banked: { kind: string; text: string; recipient?: string; occasion?: string }[];
}): Promise<BankingPrompt> {
  const c = client();
  if (!c) return fallbackPrompt(input.banked.length, input.coverage);

  const messages = input.banked.filter((b) => b.kind === 'message');

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: BANKING_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      // Measured: this call runs ~7.5-8s regardless of effort or thinking mode
      // (low/medium and adaptive/disabled were all within noise), so the cost
      // is generation, not reasoning depth. Kept adaptive because it's free
      // quality at the same latency; the wait is masked in the UI instead —
      // coverage and pipeline panels update instantly while this loads.
      effort: 'low',
      format: { type: 'json_schema', schema: BANKING_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `Patient: ${input.patientName}`,
          `Diagnosis: ${input.diagnosis}`,
          ``,
          `Phoneme coverage: ${(input.coverage.ratio * 100).toFixed(0)}%`,
          `Still missing: ${input.coverage.missing.join(', ') || 'none'}`,
          ``,
          `Recordings so far: ${input.banked.length} (${messages.length} personal messages)`,
          messages.length
            ? messages
                .map((m) => `- [${m.recipient || 'unspecified'} / ${m.occasion || 'unspecified'}] "${m.text}"`)
                .join('\n')
            : '- none yet',
          ``,
          `Choose the next prompt.`,
        ].join('\n'),
      },
    ],
  });

  return parseJson<BankingPrompt>(response) ?? fallbackPrompt(input.banked.length, input.coverage);
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
// 3. The communication profile
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

/** Keeps the session usable without an Anthropic key — clearly a stub, not silent. */
function fallbackPrompt(bankedCount: number, coverage: Coverage): BankingPrompt {
  const phonetic = [
    'The quick brown fox jumps over five lazy dogs.',
    'She thought the yellow bridge would shake in the wind.',
    'Joyce enjoyed a huge chocolate cake by the shore.',
    'Bring three sharp pencils and a thin blue notebook.',
  ];
  const useMessage = bankedCount > 0 && bankedCount % 3 === 2;

  if (useMessage) {
    return {
      kind: 'message',
      spoken: 'Tell me something you would want your family to hear on a hard day.',
      recipient: 'family',
      occasion: 'a hard day',
      rationale: 'Stub prompt — set ANTHROPIC_API_KEY for adaptive prompt selection.',
      sessionComplete: false,
    };
  }

  return {
    kind: 'phonetic',
    spoken: 'Read this one out loud, in your normal voice.',
    sentence: phonetic[bankedCount % phonetic.length],
    recipient: '',
    occasion: '',
    rationale: `Stub prompt — coverage ${(coverage.ratio * 100).toFixed(0)}%. Set ANTHROPIC_API_KEY for adaptive selection.`,
    sessionComplete: coverage.ratio >= 0.92 && bankedCount >= 8,
  };
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
