/**
 * The session, as the client sees it.
 *
 * The browser owns the session and sends it with every request. That is the
 * only arrangement that survives serverless: the instance that provisions a
 * CarePlan is frequently not the instance that handles the next recording, so
 * a server-side Map of sessions is unreliable by construction.
 *
 * The in-memory store is still consulted first — it's authoritative within a
 * single process and keeps local development honest — but a request carrying
 * its own context never depends on it.
 */

import { getSession } from './store';

export type BankedPhrase = {
  id: string;
  kind: 'phonetic' | 'message';
  transcript: string;
  recipient?: string;
  occasion?: string;
  mediaId?: string;
  /** Which entry in the essentials deck this recording covers. */
  essentialId?: string;
};

export type SessionContext = {
  id: string;
  patientName: string;
  diagnosis: string;
  /** Medplum patient id, when FHIR is wired up. */
  patientId?: string;
  banked: BankedPhrase[];
};

function coercePhrases(input: unknown): BankedPhrase[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((raw): BankedPhrase[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const transcript = typeof item.transcript === 'string' ? item.transcript : '';
    if (!transcript.trim()) return [];

    return [
      {
        id: typeof item.id === 'string' && item.id ? item.id : transcript.slice(0, 40),
        kind: item.kind === 'message' ? 'message' : 'phonetic',
        transcript,
        recipient: typeof item.recipient === 'string' && item.recipient ? item.recipient : undefined,
        occasion: typeof item.occasion === 'string' && item.occasion ? item.occasion : undefined,
        mediaId: typeof item.mediaId === 'string' && item.mediaId ? item.mediaId : undefined,
        essentialId:
          typeof item.essentialId === 'string' && item.essentialId ? item.essentialId : undefined,
      },
    ];
  });
}

/**
 * Build the session context for a request, preferring what the client sent and
 * falling back to this process's cache.
 */
export function resolveSessionContext(input: {
  sessionId?: unknown;
  patientName?: unknown;
  diagnosis?: unknown;
  patientId?: unknown;
  banked?: unknown;
}): SessionContext | null {
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  const cached = sessionId ? getSession(sessionId) : undefined;

  const clientPhrases = coercePhrases(input.banked);
  const cachedPhrases: BankedPhrase[] = (cached?.recordings ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    transcript: r.transcript,
    recipient: r.recipient,
    occasion: r.occasion,
    mediaId: r.fhir?.mediaId ?? r.id,
    essentialId: r.essentialId,
  }));

  const patientName =
    (typeof input.patientName === 'string' && input.patientName.trim()) ||
    cached?.patientName ||
    '';
  const diagnosis =
    (typeof input.diagnosis === 'string' && input.diagnosis.trim()) || cached?.diagnosis || '';

  if (!sessionId && !patientName) return null;

  return {
    id: sessionId || cached?.id || '',
    patientName,
    diagnosis,
    patientId:
      (typeof input.patientId === 'string' && input.patientId) || cached?.fhir?.patientId,
    // The client's copy is the longer-lived one; the cache only wins when the
    // client sent nothing (a fresh tab, or a direct API call).
    banked: clientPhrases.length >= cachedPhrases.length ? clientPhrases : cachedPhrases,
  };
}
