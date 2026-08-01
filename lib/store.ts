/**
 * Server-side session state.
 *
 * Medplum is the system of record. This is a per-process cache that makes the
 * local demo fast and keeps the app usable before FHIR credentials are wired
 * up — it is deliberately *not* load-bearing.
 *
 * On serverless the process is not stable: two requests from the same browser
 * can land on different instances, so nothing here may be treated as durable.
 * Every route accepts the session context from the client and falls back to
 * this cache only as an optimisation.
 */

import { randomUUID } from 'crypto';

export type Recording = {
  id: string;
  kind: 'phonetic' | 'message';
  transcript: string;
  recipient?: string;
  occasion?: string;
  durationSeconds: number;
  confidence: number;
  contentType: string;
  audio: Buffer;
  createdAt: string;
  /** Which entry in the essentials deck this recording covers. */
  essentialId?: string;
  /** Populated when the recording was mirrored into FHIR. */
  fhir?: { mediaId: string; communicationId?: string };
};

export type Session = {
  id: string;
  patientName: string;
  diagnosis: string;
  createdAt: string;
  recordings: Recording[];
  /** Medplum ids, when configured. */
  fhir?: { patientId: string; carePlanId: string; conditionId: string };
  coverageResult?: unknown;
};

/**
 * Hung off globalThis so a dev hot-reload doesn't wipe an in-progress session.
 * Without this, saving any file mid-demo silently discards every banked
 * recording — the module re-evaluates and the Map starts empty.
 */
const globalStore = globalThis as typeof globalThis & {
  __cadenceSessions?: Map<string, Session>;
  __cadenceAudio?: Map<string, { contentType: string; audio: Buffer }>;
};

const sessions: Map<string, Session> = (globalStore.__cadenceSessions ??= new Map());

/**
 * Audio keyed by recording id, independent of any session. Playback has to
 * work on an instance that never saw the session that produced the recording,
 * so this is checked before falling back to Medplum.
 */
const audioCache: Map<string, { contentType: string; audio: Buffer }> = (globalStore.__cadenceAudio ??=
  new Map());

export function createSession(input: {
  patientName: string;
  diagnosis: string;
  fhir?: { patientId: string; carePlanId: string; conditionId: string };
}): Session {
  const session: Session = {
    // Reuse the Medplum patient id when there is one, so a session id is
    // meaningful on any instance rather than only the one that minted it.
    id: input.fhir?.patientId ?? randomUUID(),
    patientName: input.patientName,
    diagnosis: input.diagnosis,
    createdAt: new Date().toISOString(),
    recordings: [],
    fhir: input.fhir,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(): Session[] {
  return [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addRecording(
  sessionId: string,
  recording: Omit<Recording, 'id' | 'createdAt'> & { id?: string }
): Recording {
  const full: Recording = {
    ...recording,
    id: recording.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
  };

  cacheAudio(full.id, full.contentType, full.audio);
  sessions.get(sessionId)?.recordings.push(full);
  return full;
}

export function cacheAudio(id: string, contentType: string, audio: Buffer) {
  audioCache.set(id, { contentType, audio });
}

export function getCachedAudio(id: string) {
  return audioCache.get(id);
}

export function findRecording(recordingId: string): Recording | undefined {
  for (const session of sessions.values()) {
    const hit = session.recordings.find((r) => r.id === recordingId);
    if (hit) return hit;
  }
  return undefined;
}

/** Strips audio buffers so a session can be sent to the client as JSON. */
export function serializeSession(session: Session) {
  return {
    id: session.id,
    patientName: session.patientName,
    diagnosis: session.diagnosis,
    createdAt: session.createdAt,
    fhir: session.fhir,
    coverageResult: session.coverageResult,
    // Audio buffers are deliberately omitted — they're served by /api/audio.
    recordings: session.recordings.map((r) => ({
      id: r.id,
      kind: r.kind,
      transcript: r.transcript,
      recipient: r.recipient,
      occasion: r.occasion,
      durationSeconds: r.durationSeconds,
      confidence: r.confidence,
      contentType: r.contentType,
      createdAt: r.createdAt,
      fhir: r.fhir,
      audioUrl: `/api/audio/${r.id}`,
    })),
  };
}

export type SerializedSession = ReturnType<typeof serializeSession>;
