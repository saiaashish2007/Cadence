/**
 * Keyword fallback over the banked library.
 *
 * Moss is the real retrieval path. This exists so the decode flow still
 * demonstrates end-to-end when Moss isn't configured or an index hasn't
 * reached the cloud yet — and the UI labels which one answered, so a slow
 * keyword match is never passed off as a sub-10ms semantic hit.
 */

import type { PhraseMatch } from './moss';

export type LibraryPhrase = {
  id: string;
  text: string;
  kind: 'phonetic' | 'message';
  recipient?: string;
  occasion?: string;
  mediaId?: string;
};

export function parseLibrary(input: unknown): LibraryPhrase[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((raw): LibraryPhrase[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const text =
      typeof item.text === 'string'
        ? item.text
        : typeof item.transcript === 'string'
          ? item.transcript
          : '';
    if (!text.trim()) return [];

    const id = typeof item.id === 'string' && item.id ? item.id : text.slice(0, 40);
    return [
      {
        id,
        text,
        kind: item.kind === 'message' ? 'message' : 'phonetic',
        recipient: typeof item.recipient === 'string' && item.recipient ? item.recipient : undefined,
        occasion: typeof item.occasion === 'string' && item.occasion ? item.occasion : undefined,
        mediaId: typeof item.mediaId === 'string' && item.mediaId ? item.mediaId : id,
      },
    ];
  });
}

export function keywordMatches(
  transcript: string,
  library: LibraryPhrase[],
  topK = 5
): { matches: PhraseMatch[]; latencyMs: number } {
  const terms = new Set(
    transcript
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
  );

  const started = performance.now();
  const matches = library
    .map((phrase) => {
      const words = new Set(phrase.text.toLowerCase().split(/\W+/).filter(Boolean));
      const overlap = [...terms].filter((t) => words.has(t)).length;
      return {
        id: phrase.id,
        text: phrase.text,
        kind: phrase.kind,
        recipient: phrase.recipient,
        occasion: phrase.occasion,
        mediaId: phrase.mediaId,
        score: terms.size ? overlap / terms.size : 0,
      };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { matches, latencyMs: performance.now() - started };
}
