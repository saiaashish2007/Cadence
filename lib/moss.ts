/**
 * Moss — sub-10ms retrieval over the banked phrase library.
 *
 * This is the piece that makes the *decode* half work, and it's genuinely the
 * right tool rather than a bolted-on sponsor. An AAC device is a live
 * conversation aid: when a caregiver hears an utterance they can't parse, or
 * the patient starts typing "tell my son…", the closest banked phrase has to
 * surface at conversation speed. Cloud round-trips at 100–500ms don't clear
 * that bar; a local in-memory index does.
 *
 * We use Moss `session()` indexes — the phrase bank is built in-process during
 * capture, queried locally, and pushed to the cloud at session end so the same
 * index is there for the caregiver later.
 */

import type { MossClient, SessionIndex, QueryResultDocumentInfo } from '@moss-dev/moss';

const PROJECT_ID = process.env.MOSS_PROJECT_ID;
const PROJECT_KEY = process.env.MOSS_PROJECT_KEY;

export const mossConfigured = Boolean(PROJECT_ID && PROJECT_KEY);

/**
 * Both the client and the loaded session indexes hang off globalThis. Beyond
 * surviving dev hot-reload, this matters more here than elsewhere: MossClient
 * holds native (napi) resources, so a fresh one per module evaluation leaks a
 * runtime handle and re-downloads every index.
 */
const globalMoss = globalThis as typeof globalThis & {
  __cadenceMossClient?: MossClient;
  __cadenceMossSessions?: Map<string, SessionIndex>;
};

const sessions: Map<string, SessionIndex> = (globalMoss.__cadenceMossSessions ??= new Map());

async function getClient(): Promise<MossClient | null> {
  if (!mossConfigured) return null;
  if (!globalMoss.__cadenceMossClient) {
    // Keep the native N-API module out of Next.js's route-data collection.
    // It is loaded only when a Moss-backed request arrives.
    const { MossClient } = await import('@moss-dev/moss');
    globalMoss.__cadenceMossClient = new MossClient(PROJECT_ID!, PROJECT_KEY!);
  }
  return globalMoss.__cadenceMossClient;
}

/** One index per patient — the phrase bank is personal by definition. */
export function indexName(patientId: string) {
  return `voicebank-${patientId}`;
}

/**
 * Open the patient's phrase bank, pulling in anything already banked in a
 * previous session. Cached per patient so repeat queries stay in-memory.
 */
export async function openBank(patientId: string): Promise<SessionIndex | null> {
  const c = await getClient();
  if (!c) return null;

  const name = indexName(patientId);
  const existing = sessions.get(name);
  if (existing) return existing;

  const session = await c.session(name);
  try {
    await session.loadIndex(name);
  } catch {
    // First session for this patient — nothing in the cloud yet. Start empty.
  }
  sessions.set(name, session);
  return session;
}

export type BankedPhrase = {
  id: string;
  text: string;
  /**
   * 'observed' is an utterance a caregiver heard later and confirmed the
   * meaning of. It's indexed on the *heard* form, so the next person who hears
   * the same sound retrieves the confirmed reading directly — which is how the
   * library keeps up with speech that is still changing.
   */
  kind: 'phonetic' | 'message' | 'observed';
  recipient?: string;
  occasion?: string;
  mediaId?: string;
  /** Set on observed utterances: what it turned out to mean. */
  meaning?: string;
};

/** Index a freshly banked phrase. Runs locally — no cloud round-trip. */
export async function addPhrase(patientId: string, phrase: BankedPhrase) {
  const session = await openBank(patientId);
  if (!session) return null;

  await session.addDocs([
    {
      id: phrase.id,
      text: phrase.text,
      metadata: {
        kind: phrase.kind,
        recipient: phrase.recipient ?? '',
        occasion: phrase.occasion ?? '',
        mediaId: phrase.mediaId ?? '',
        meaning: phrase.meaning ?? '',
      },
    },
  ]);

  return { docCount: session.docCount };
}

export type PhraseMatch = BankedPhrase & { score: number };

/** The hot path: find the banked phrases closest to what was just said. */
export async function searchBank(
  patientId: string,
  query: string,
  topK = 5
): Promise<{ matches: PhraseMatch[]; latencyMs: number } | null> {
  const session = await openBank(patientId);
  if (!session) return null;

  const started = performance.now();
  const result = await session.query(query, { topK });
  const wallClockMs = performance.now() - started;

  const matches: PhraseMatch[] = (result.docs ?? []).map((doc: QueryResultDocumentInfo) => {
    const meta = doc.metadata ?? {};
    return {
      id: doc.id,
      text: doc.text,
      score: doc.score,
      kind:
        meta.kind === 'phonetic' ? 'phonetic' : meta.kind === 'observed' ? 'observed' : 'message',
      recipient: meta.recipient || undefined,
      occasion: meta.occasion || undefined,
      mediaId: meta.mediaId || undefined,
      meaning: meta.meaning || undefined,
    };
  });

  // Prefer the engine's own timing when it reports one — that's the number the
  // sub-10ms claim actually refers to, without our own await overhead in it.
  return { matches, latencyMs: result.timeTakenInMs ?? wallClockMs };
}

/** Persist the phrase bank to Moss Cloud so the caregiver side can load it. */
export async function pushBank(patientId: string) {
  const session = sessions.get(indexName(patientId));
  if (!session) return null;
  return session.pushIndex();
}
