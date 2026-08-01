'use client';

/**
 * The browser's copy of a banking session.
 *
 * This is the durable one. Serverless instances come and go between requests,
 * so the tab that ran the session holds the canonical list of what was banked
 * and sends it along with each call. It also means the decoder — which the
 * demo opens in a second tab — can see the library immediately, since
 * localStorage is shared across tabs of the same origin.
 *
 * Audio is deliberately not kept here. It lives in Medplum as a Binary and is
 * streamed back through /api/audio, which keeps this well clear of the ~5MB
 * localStorage ceiling.
 */

export type BankedRecording = {
  id: string;
  kind: 'phonetic' | 'message';
  transcript: string;
  recipient?: string;
  occasion?: string;
  confidence: number;
  durationSeconds: number;
  mediaId?: string;
  audioUrl: string;
};

export type CadenceSession = {
  id: string;
  patientName: string;
  diagnosis: string;
  patientId?: string;
  carePlanId?: string;
  fhirLinked: boolean;
  createdAt: string;
  updatedAt: string;
  banked: BankedRecording[];
};

const KEY = 'cadence.sessions.v1';

export function loadSessions(): CadenceSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as CadenceSession[])
      .filter((s) => s && typeof s.id === 'string')
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } catch {
    return [];
  }
}

export function saveSession(session: CadenceSession) {
  if (typeof window === 'undefined') return;
  const next = [session, ...loadSessions().filter((s) => s.id !== session.id)];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full quota shouldn't take down an in-progress session; the server copy
    // of this request still carries everything it needs.
  }
}

export function findSession(id: string): CadenceSession | undefined {
  return loadSessions().find((s) => s.id === id);
}

/** The shape the API routes expect for the banked library. */
export function toLibrary(banked: BankedRecording[]) {
  return banked.map((r) => ({
    id: r.id,
    text: r.transcript,
    transcript: r.transcript,
    kind: r.kind,
    recipient: r.recipient,
    occasion: r.occasion,
    mediaId: r.mediaId ?? r.id,
  }));
}
