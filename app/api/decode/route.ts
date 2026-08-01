/**
 * The decode half — VOCA's job, grounded in the patient's own banked library.
 *
 * A listener hears something they can't parse. Moss finds the nearest phrases
 * this person actually banked; Claude reads the transcription against them and
 * proposes a meaning plus something concrete to say back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribe, deepgramConfigured } from '@/lib/deepgram';
import { searchBank, mossConfigured, type PhraseMatch } from '@/lib/moss';
import { decodeUtterance, claudeConfigured } from '@/lib/claude';
import { keywordMatches, parseLibrary } from '@/lib/retrieval';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let sessionId = '';
  let transcript = '';
  let context: string | undefined;
  let asrConfidence: number | null = null;
  let library: unknown = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionId = String(form.get('sessionId') ?? '');
    context = String(form.get('context') ?? '') || undefined;
    const file = form.get('audio');

    try {
      library = JSON.parse(String(form.get('library') ?? '[]'));
    } catch {
      // Falls through to whatever Moss returns.
    }

    if (file instanceof Blob && deepgramConfigured) {
      try {
        const result = await transcribe(await file.arrayBuffer(), file.type || 'audio/webm');
        transcript = result?.text.trim() ?? '';
        asrConfidence = result?.confidence ?? null;
      } catch (err) {
        console.error('[deepgram] decode transcription failed:', err);
      }
    }
    // A typed fallback matters here: dysarthric speech is exactly the input ASR
    // is worst at, so the listener needs a way in when the transcript is empty.
    if (!transcript) transcript = String(form.get('transcript') ?? '');
  } else {
    const body = await req.json();
    sessionId = body.sessionId ?? '';
    transcript = body.transcript ?? '';
    context = body.context || undefined;
    library = body.library ?? [];
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: 'nothing to decode' }, { status: 400 });
  }

  // Moss: nearest banked phrases, measured.
  let matches: PhraseMatch[] = [];
  let retrievalMs: number | null = null;
  let engine = 'keyword-fallback';

  if (mossConfigured && sessionId) {
    try {
      const result = await searchBank(sessionId, transcript, 5, [
        'phonetic',
        'message',
        'observed',
      ]);
      matches = result?.matches ?? [];
      retrievalMs = result?.latencyMs ?? null;
      if (matches.length) engine = 'moss';
    } catch (err) {
      console.error('[moss] searchBank failed:', err);
    }
  }

  if (!matches.length) {
    const fallback = keywordMatches(transcript, parseLibrary(library));
    matches = fallback.matches;
    retrievalMs = fallback.latencyMs;
  }

  const decoding = await decodeUtterance({ transcript, matches, context });

  return NextResponse.json({
    transcript,
    asrConfidence,
    matches,
    decoding,
    retrieval: { engine, latencyMs: retrievalMs },
    reasoningLive: claudeConfigured,
    playbackUrl: decoding.playBackMediaId ? `/api/audio/${decoding.playBackMediaId}` : null,
  });
}
