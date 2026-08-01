/**
 * Retrieval only — no reasoning layer.
 *
 * Split out from /api/decode so the UI can paint the banked matches the
 * instant they come back. Moss answers in single-digit milliseconds; making
 * that wait behind an ~8s model call would hide the one number worth showing.
 *
 * Returns the transcript so the caller can pass it straight to /api/decode
 * without paying for a second Deepgram transcription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribe, deepgramConfigured } from '@/lib/deepgram';
import { searchBank, mossConfigured, type PhraseMatch } from '@/lib/moss';
import { keywordMatches, parseLibrary } from '@/lib/retrieval';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let sessionId = '';
  let transcript = '';
  let asrConfidence: number | null = null;
  let library: unknown = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionId = String(form.get('sessionId') ?? '');
    const file = form.get('audio');

    try {
      library = JSON.parse(String(form.get('library') ?? '[]'));
    } catch {
      // The fallback index is a convenience; Moss is the real path.
    }

    if (file instanceof Blob && deepgramConfigured) {
      try {
        const result = await transcribe(await file.arrayBuffer(), file.type || 'audio/webm');
        transcript = result?.text.trim() ?? '';
        asrConfidence = result?.confidence ?? null;
      } catch (err) {
        console.error('[deepgram] retrieve transcription failed:', err);
      }
    }
    if (!transcript) transcript = String(form.get('transcript') ?? '');
  } else {
    const body = await req.json();
    sessionId = body.sessionId ?? '';
    transcript = body.transcript ?? '';
    library = body.library ?? [];
  }

  if (!transcript.trim()) return NextResponse.json({ error: 'nothing to decode' }, { status: 400 });

  let matches: PhraseMatch[] = [];
  let latencyMs: number | null = null;
  let engine = 'keyword-fallback';

  if (mossConfigured && sessionId) {
    try {
      const result = await searchBank(sessionId, transcript, 5, [
        'phonetic',
        'message',
        'observed',
      ]);
      matches = result?.matches ?? [];
      latencyMs = result?.latencyMs ?? null;
      if (matches.length) engine = 'moss';
    } catch (err) {
      console.error('[moss] searchBank failed:', err);
    }
  }

  if (!matches.length) {
    const fallback = keywordMatches(transcript, parseLibrary(library));
    matches = fallback.matches;
    latencyMs = fallback.latencyMs;
  }

  return NextResponse.json({
    sessionId,
    transcript,
    asrConfidence,
    matches,
    retrieval: { engine, latencyMs },
  });
}
