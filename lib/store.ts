/**
 * Server-side session state.
 *
 * Medplum is the system of record — but the audio also has to be servable back
 * to the browser instantly for the playback moment, and the session has to work
 * end-to-end even before FHIR credentials are wired up. So recordings live here
 * in memory for the life of the process and are mirrored to FHIR when Medplum
 * is configured.
 *
 * In-memory is the right call for a demo and the wrong one for production; the
 * swap is this one file.
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
  fhir?: { patientId: string; carePlanId: string };
  coverageResult?: unknown;
};

/**
 * Hung off globalThis so a dev hot-reload doesn't wipe an in-progress session.
 * Without this, saving any file mid-demo silently discards every banked
 * recording — the module re-evaluates and the Map starts empty.
 */
const globalStore = globalThis as typeof globalThis & {
  __cadenceSessions?: Map<string, Session>;
};

const sessions: Map<string, Session> = (globalStore.__cadenceSessions ??= new Map());

export function createSession(input: {
  patientName: string;
  diagnosis: string;
  fhir?: { patientId: string; carePlanId: string };
}): Session {
  const session: Session = {
    id: randomUUID(),
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

export function addRecording(sessionId: string, recording: Omit<Recording, 'id' | 'createdAt'>) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const full: Recording = { ...recording, id: randomUUID(), createdAt: new Date().toISOString() };
  session.recordings.push(full);
  return full;
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
