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
import { getSession } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let sessionId = '';
  let transcript = '';
  let asrConfidence: number | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionId = String(form.get('sessionId') ?? '');
    const file = form.get('audio');

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
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });
  if (!transcript.trim()) return NextResponse.json({ error: 'nothing to decode' }, { status: 400 });

  let matches: PhraseMatch[] = [];
  let latencyMs: number | null = null;

  if (mossConfigured) {
    try {
      const result = await searchBank(sessionId, transcript, 5);
      matches = result?.matches ?? [];
      latencyMs = result?.latencyMs ?? null;
    } catch (err) {
      console.error('[moss] searchBank failed:', err);
    }
  }

  return NextResponse.json({
    transcript,
    asrConfidence,
    matches,
    retrieval: { engine: mossConfigured ? 'moss' : 'keyword-fallback', latencyMs },
  });
}
