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
import { getSession } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  let sessionId = '';
  let transcript = '';
  let context: string | undefined;
  let asrConfidence: number | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionId = String(form.get('sessionId') ?? '');
    context = String(form.get('context') ?? '') || undefined;
    const file = form.get('audio');

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
  }

  if (!getSession(sessionId)) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }
  if (!transcript.trim()) {
    return NextResponse.json({ error: 'nothing to decode' }, { status: 400 });
  }

  // Moss: nearest banked phrases, measured.
  let matches: PhraseMatch[] = [];
  let retrievalMs: number | null = null;

  if (mossConfigured) {
    try {
      const result = await searchBank(sessionId, transcript, 5);
      matches = result?.matches ?? [];
      retrievalMs = result?.latencyMs ?? null;
    } catch (err) {
      console.error('[moss] searchBank failed:', err);
    }
  }

  if (!matches.length) {
    // Without Moss, fall back to a keyword overlap over the same library so the
    // decode flow still demonstrates end-to-end. Labelled as such in the UI.
    const session = getSession(sessionId)!;
    const terms = new Set(transcript.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
    const started = performance.now();
    matches = session.recordings
      .map((r) => {
        const words = new Set(r.transcript.toLowerCase().split(/\W+/).filter(Boolean));
        const overlap = [...terms].filter((t) => words.has(t)).length;
        return {
          id: r.id,
          text: r.transcript,
          kind: r.kind,
          recipient: r.recipient,
          occasion: r.occasion,
          mediaId: r.id,
          score: terms.size ? overlap / terms.size : 0,
        };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    retrievalMs = performance.now() - started;
  }

  const decoding = await decodeUtterance({ transcript, matches, context });

  return NextResponse.json({
    transcript,
    asrConfidence,
    matches,
    decoding,
    retrieval: { engine: mossConfigured ? 'moss' : 'keyword-fallback', latencyMs: retrievalMs },
    reasoningLive: claudeConfigured,
    playbackUrl: decoding.playBackMediaId ? `/api/audio/${decoding.playBackMediaId}` : null,
  });
}
