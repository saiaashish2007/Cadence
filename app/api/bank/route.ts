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
import { addPhrase, pushBank, mossConfigured } from '@/lib/moss';
import { addRecording } from '@/lib/store';
import { resolveSessionContext } from '@/lib/session-context';
import { coverageOf } from '@/lib/phonetics';
import { essentialById } from '@/lib/essentials';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const kind = (String(form.get('kind') ?? 'phonetic') === 'message' ? 'message' : 'phonetic') as
    | 'phonetic'
    | 'message';
  const recipient = String(form.get('recipient') ?? '') || undefined;
  const occasion = String(form.get('occasion') ?? '') || undefined;
  const expected = String(form.get('expected') ?? '');
  const essentialId = String(form.get('essentialId') ?? '') || undefined;
  const file = form.get('audio');

  let banked: unknown = [];
  try {
    banked = JSON.parse(String(form.get('banked') ?? '[]'));
  } catch {
    // A malformed library only costs coverage accuracy, not the recording.
  }

  const context = resolveSessionContext({
    sessionId: form.get('sessionId'),
    patientName: form.get('patientName'),
    diagnosis: form.get('diagnosis'),
    patientId: form.get('patientId'),
    banked,
  });

  if (!context) {
    return NextResponse.json({ error: 'session context is required' }, { status: 400 });
  }
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

  // 2. Medplum — the banked voice becomes part of the medical record.
  let fhir: { mediaId: string; communicationId?: string } | undefined;
  if (medplumConfigured && context.patientId) {
    try {
      const saved = await saveRecording({
        patientId: context.patientId,
        audio,
        contentType,
        transcript,
        durationSeconds,
        kind,
        recipient,
        occasion,
        essentialId,
      });
      if (saved) fhir = saved;
    } catch (err) {
      console.error('[medplum] saveRecording failed:', err);
    }
  }

  // The Media id doubles as the recording id so playback resolves from FHIR on
  // any instance, not just the one that happens to hold the audio in memory.
  const recording = addRecording(context.id, {
    id: fhir?.mediaId,
    kind,
    transcript,
    recipient,
    occasion,
    durationSeconds,
    confidence,
    contentType,
    audio: Buffer.from(audio),
    fhir,
    essentialId,
  });

  // 3. Moss — index it so the decoder can reach it at conversation speed.
  let indexedDocs: number | null = null;
  if (mossConfigured) {
    try {
      const result = await addPhrase(context.id, {
        id: recording.id,
        text: transcript,
        kind,
        recipient,
        occasion,
        mediaId: recording.id,
        essentialId,
      });
      indexedDocs = result?.docCount ?? null;

      // Deck phrases get a second document indexed on the *questions* they
      // answer, so someone asking "are you in pain?" reaches the recording of
      // "I'm in pain" — which does not resemble the question at all.
      const essential = essentialId ? essentialById(essentialId) : undefined;
      if (essential) {
        const answer = await addPhrase(context.id, {
          id: `${recording.id}:asked`,
          text: essential.triggers.join('. '),
          kind: 'answer',
          meaning: transcript,
          mediaId: recording.id,
          essentialId,
        });
        indexedDocs = answer?.docCount ?? indexedDocs;
      }

      // Publish the index so the caregiver side — a different tab, and very
      // likely a different serverless instance — can load and query it.
      await pushBank(context.id);
    } catch (err) {
      console.error('[moss] addPhrase failed:', err);
    }
  }

  const transcripts = [...context.banked.map((r) => r.transcript), transcript];
  const coverage = coverageOf(transcripts);

  // Establish the speech baseline once there's enough signal to mean something.
  // In six months this row is the reason progression is measurable at all.
  if (medplumConfigured && context.patientId && transcripts.length === 3) {
    try {
      const totalWords = transcripts.reduce(
        (n, t) => n + t.split(/\s+/).filter(Boolean).length,
        0
      );
      await saveSpeechBaseline({
        patientId: context.patientId,
        // Only this take is timed; earlier durations live on the client. Rate
        // is derived from it rather than pretending to a fuller measurement.
        wordsPerMinute: durationSeconds
          ? transcript.split(/\s+/).filter(Boolean).length / (durationSeconds / 60)
          : totalWords,
        meanConfidence: confidence,
      });
    } catch (err) {
      console.error('[medplum] saveSpeechBaseline failed:', err);
    }
  }

  return NextResponse.json({
    recording: {
      id: recording.id,
      kind: recording.kind,
      transcript: recording.transcript,
      recipient: recording.recipient,
      occasion: recording.occasion,
      durationSeconds: recording.durationSeconds,
      confidence: recording.confidence,
      essentialId,
      mediaId: fhir?.mediaId,
      fhir,
      audioUrl: `/api/audio/${recording.id}`,
    },
    coverage,
    services: {
      deepgram: deepgramConfigured,
      medplum: Boolean(fhir),
      moss: indexedDocs !== null,
      indexedDocs,
    },
  });
}
