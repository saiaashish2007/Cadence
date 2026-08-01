/**
 * Speaking for them.
 *
 * Someone asks a question out loud. The person it was asked of can't reply —
 * but they banked the answer, in their own voice, back when they could. Moss
 * matches the question against the question-forms each phrase was banked to
 * answer, and the model picks which one to play.
 *
 * The bar here is deliberately high: this plays audio in someone's own voice,
 * in front of the person who asked. A wrong answer is words put in their mouth.
 * Returning nothing is always allowed and is the right call when unsure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribe, deepgramConfigured } from '@/lib/deepgram';
import { searchBank, mossConfigured, type PhraseMatch } from '@/lib/moss';
import { suggestAnswers, claudeConfigured } from '@/lib/claude';
import { essentialById } from '@/lib/essentials';
import { parseLibrary, keywordMatches } from '@/lib/retrieval';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let sessionId = '';
  let question = '';
  let library: unknown = [];
  let asrConfidence: number | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionId = String(form.get('sessionId') ?? '');
    try {
      library = JSON.parse(String(form.get('library') ?? '[]'));
    } catch {
      /* falls back to Moss alone */
    }

    const file = form.get('audio');
    if (file instanceof Blob && deepgramConfigured) {
      try {
        const result = await transcribe(await file.arrayBuffer(), file.type || 'audio/webm');
        question = result?.text.trim() ?? '';
        asrConfidence = result?.confidence ?? null;
      } catch (err) {
        console.error('[deepgram] question transcription failed:', err);
      }
    }
    if (!question) question = String(form.get('question') ?? '');
  } else {
    const body = await req.json();
    sessionId = body.sessionId ?? '';
    question = body.question ?? '';
    library = body.library ?? [];
  }

  if (!question.trim()) {
    return NextResponse.json({ error: 'no question to answer' }, { status: 400 });
  }

  // Match against the question-forms, not the answers: "are you in pain?" looks
  // nothing like "I'm in pain".
  let matches: PhraseMatch[] = [];
  let latencyMs: number | null = null;
  let engine = 'keyword-fallback';

  if (mossConfigured && sessionId) {
    try {
      const result = await searchBank(sessionId, question, 5, ['answer']);
      matches = result?.matches ?? [];
      latencyMs = result?.latencyMs ?? null;
      if (matches.length) engine = 'moss';
    } catch (err) {
      console.error('[moss] answer search failed:', err);
    }
  }

  if (!matches.length) {
    // Without an index, match the question against the deck's own trigger
    // phrasings for whatever this person has banked.
    const banked = parseLibrary(library).filter((p) => p.essentialId);
    const triggerDocs = banked.flatMap((p) => {
      const essential = essentialById(p.essentialId!);
      if (!essential) return [];
      return [
        {
          id: p.id,
          text: essential.triggers.join('. '),
          kind: 'answer' as const,
          mediaId: p.mediaId ?? p.id,
        },
      ];
    });

    const fallback = keywordMatches(question, triggerDocs);
    matches = fallback.matches.map((m) => ({
      ...m,
      meaning: banked.find((b) => b.id === m.id)?.text,
    }));
    latencyMs = fallback.latencyMs;
  }

  const candidates = matches
    .filter((m) => m.meaning && m.mediaId)
    .map((m) => ({
      recordingId: m.mediaId!,
      answer: m.meaning!,
      asks: m.essentialId ? (essentialById(m.essentialId)?.triggers.join(', ') ?? m.text) : m.text,
    }));

  if (!candidates.length) {
    return NextResponse.json({
      question,
      asrConfidence,
      suggestions: [],
      autoplayId: '',
      rationale: "Nothing they banked is relevant to this. Better to say nothing than to guess.",
      retrieval: { engine, latencyMs },
      reasoningLive: claudeConfigured,
    });
  }

  const shortlist = await suggestAnswers({ question, candidates });
  const byId = new Map(candidates.map((c) => [c.recordingId, c]));

  const suggestions = shortlist.recordingIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      recordingId: c.recordingId,
      answer: c.answer,
      audioUrl: `/api/audio/${c.recordingId}`,
    }));

  return NextResponse.json({
    question,
    asrConfidence,
    suggestions,
    // Only honour autoplay for something actually on the shortlist.
    autoplayId: suggestions.some((s) => s.recordingId === shortlist.autoplayId)
      ? shortlist.autoplayId
      : '',
    rationale: shortlist.rationale,
    retrieval: { engine, latencyMs },
    reasoningLive: claudeConfigured,
  });
}
