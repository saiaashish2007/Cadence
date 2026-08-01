/**
 * One recording, all four sponsors:
 *
 *   Deepgram  transcribes what was said
 *   Medplum   stores the audio as Media and the message as Communication
 *   Moss      indexes the text so the decoder can find it in single-digit ms
 *   (Stedi runs once at session end, in /api/coverage)
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribe, deepgramConfigured } from '@/lib/deepgram';
import { saveRecording, saveSpeechBaseline, medplumConfigured } from '@/lib/medplum';
import { addPhrase, mossConfigured } from '@/lib/moss';
import { addRecording, getSession, serializeSession } from '@/lib/store';
import { coverageOf } from '@/lib/phonetics';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const sessionId = String(form.get('sessionId') ?? '');
  const kind = (String(form.get('kind') ?? 'phonetic') === 'message' ? 'message' : 'phonetic') as
    | 'phonetic'
    | 'message';
  const recipient = String(form.get('recipient') ?? '') || undefined;
  const occasion = String(form.get('occasion') ?? '') || undefined;
  const expected = String(form.get('expected') ?? '');
  const file = form.get('audio');

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
  }

  const contentType = file.type || 'audio/webm';
  const audio = await file.arrayBuffer();

  // 1. Deepgram — what did they actually say?
  let transcript = expected;
  let confidence = 0;
  let durationSeconds = 0;

  if (deepgramConfigured) {
    try {
      const result = await transcribe(audio, contentType);
      if (result) {
        // Fall back to the prompted sentence when ASR returns nothing usable —
        // a silent transcript would otherwise poison the coverage calculation.
        transcript = result.text.trim() || expected;
        confidence = result.confidence;
        durationSeconds = result.durationSeconds;
      }
    } catch (err) {
      console.error('[deepgram] transcription failed:', err);
    }
  }

  if (!transcript) {
    return NextResponse.json({ error: 'no transcript and no expected text' }, { status: 400 });
  }

  const recording = addRecording(sessionId, {
    kind,
    transcript,
    recipient,
    occasion,
    durationSeconds,
    confidence,
    contentType,
    audio: Buffer.from(audio),
  })!;

  // 2. Medplum — the banked voice becomes part of the medical record.
  if (medplumConfigured && session.fhir) {
    try {
      const saved = await saveRecording({
        patientId: session.fhir.patientId,
        audio,
        contentType,
        transcript,
        durationSeconds,
        kind,
        recipient,
        occasion,
      });
      if (saved) recording.fhir = saved;
    } catch (err) {
      console.error('[medplum] saveRecording failed:', err);
    }
  }

  // 3. Moss — index it so the decoder can reach it at conversation speed.
  let indexedDocs: number | null = null;
  if (mossConfigured) {
    try {
      const result = await addPhrase(sessionId, {
        id: recording.id,
        text: transcript,
        kind,
        recipient,
        occasion,
        mediaId: recording.id,
      });
      indexedDocs = result?.docCount ?? null;
    } catch (err) {
      console.error('[moss] addPhrase failed:', err);
    }
  }

  const coverage = coverageOf(session.recordings.map((r) => r.transcript));

  // Establish the speech baseline once there's enough signal to mean something.
  // In six months this row is the reason progression is measurable at all.
  if (medplumConfigured && session.fhir && session.recordings.length === 3) {
    try {
      const totalWords = session.recordings.reduce(
        (n, r) => n + r.transcript.split(/\s+/).filter(Boolean).length,
        0
      );
      const totalMinutes =
        session.recordings.reduce((n, r) => n + r.durationSeconds, 0) / 60 || 1;
      const meanConfidence =
        session.recordings.reduce((n, r) => n + r.confidence, 0) / session.recordings.length;

      await saveSpeechBaseline({
        patientId: session.fhir.patientId,
        wordsPerMinute: totalWords / totalMinutes,
        meanConfidence,
      });
    } catch (err) {
      console.error('[medplum] saveSpeechBaseline failed:', err);
    }
  }

  return NextResponse.json({
    recording: { ...recording, audio: undefined, audioUrl: `/api/audio/${recording.id}` },
    coverage,
    session: serializeSession(session),
    services: {
      deepgram: deepgramConfigured,
      medplum: Boolean(recording.fhir),
      moss: indexedDocs !== null,
      indexedDocs,
    },
  });
}
