/**
 * Phoneme coverage tracking.
 *
 * Standard voice banking asks people to read 1,600 scripted sentences alone at
 * a computer. Most never finish — and by the time they're told to start, their
 * speech has often already begun to slur, which degrades the synthetic voice.
 *
 * We track which phonemes the corpus has actually captured so the session can
 * stop when it has enough rather than running to a fixed script. This is a
 * deliberately transparent approximation (grapheme→phoneme heuristics over
 * ARPAbet classes), computed locally so the progress bar is honest and instant.
 */

/** ARPAbet-style inventory, grouped so the UI can show coverage by class. */
export const PHONEME_CLASSES = {
  vowels: ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'],
  plosives: ['B', 'D', 'G', 'K', 'P', 'T'],
  fricatives: ['DH', 'F', 'HH', 'S', 'SH', 'TH', 'V', 'Z', 'ZH'],
  affricates: ['CH', 'JH'],
  nasals: ['M', 'N', 'NG'],
  liquids: ['L', 'R'],
  glides: ['W', 'Y'],
} as const;

export const ALL_PHONEMES: string[] = Object.values(PHONEME_CLASSES).flat();

/** Ordered longest-first so digraphs win over single letters. */
const RULES: [RegExp, string[]][] = [
  [/^sch/, ['S', 'K']],
  [/^tch/, ['CH']],
  [/^ch/, ['CH']],
  [/^sh/, ['SH']],
  [/^th/, ['TH']],
  [/^ph/, ['F']],
  [/^wh/, ['W']],
  [/^ng/, ['NG']],
  [/^qu/, ['K', 'W']],
  [/^ck/, ['K']],
  [/^oo/, ['UW']],
  [/^ee/, ['IY']],
  [/^ea/, ['IY']],
  [/^ai/, ['EY']],
  [/^ay/, ['EY']],
  [/^oa/, ['OW']],
  [/^ow/, ['OW']],
  [/^ou/, ['AW']],
  [/^oi/, ['OY']],
  [/^oy/, ['OY']],
  [/^au/, ['AO']],
  [/^aw/, ['AO']],
  [/^ir/, ['ER']],
  [/^er/, ['ER']],
  [/^ur/, ['ER']],
  [/^ar/, ['AA', 'R']],
  [/^or/, ['AO', 'R']],
  [/^a/, ['AE']],
  [/^b/, ['B']],
  [/^c/, ['K']],
  [/^d/, ['D']],
  [/^e/, ['EH']],
  [/^f/, ['F']],
  [/^g/, ['G']],
  [/^h/, ['HH']],
  [/^i/, ['IH']],
  [/^j/, ['JH']],
  [/^k/, ['K']],
  [/^l/, ['L']],
  [/^m/, ['M']],
  [/^n/, ['N']],
  [/^o/, ['AA']],
  [/^p/, ['P']],
  [/^r/, ['R']],
  [/^s/, ['S']],
  [/^t/, ['T']],
  [/^u/, ['AH']],
  [/^v/, ['V']],
  [/^w/, ['W']],
  [/^x/, ['K', 'S']],
  [/^y/, ['Y']],
  [/^z/, ['Z']],
];

/** Approximate the phoneme set present in a stretch of text. */
export function phonemesIn(text: string): Set<string> {
  const found = new Set<string>();
  let rest = text.toLowerCase().replace(/[^a-z\s]/g, '');

  while (rest.length > 0) {
    if (rest[0] === ' ') {
      rest = rest.slice(1);
      continue;
    }
    const rule = RULES.find(([pattern]) => pattern.test(rest));
    if (!rule) {
      rest = rest.slice(1);
      continue;
    }
    rule[1].forEach((p) => found.add(p));
    rest = rest.replace(rule[0], '');
  }

  return found;
}

export type Coverage = {
  covered: string[];
  missing: string[];
  /** 0–1 across the whole inventory. */
  ratio: number;
  byClass: { name: string; covered: number; total: number }[];
};

export function coverageOf(texts: string[]): Coverage {
  const covered = new Set<string>();
  texts.forEach((t) => phonemesIn(t).forEach((p) => covered.add(p)));

  const coveredList = ALL_PHONEMES.filter((p) => covered.has(p));
  const missing = ALL_PHONEMES.filter((p) => !covered.has(p));

  return {
    covered: coveredList,
    missing,
    ratio: coveredList.length / ALL_PHONEMES.length,
    byClass: Object.entries(PHONEME_CLASSES).map(([name, list]) => ({
      name,
      covered: (list as readonly string[]).filter((p) => covered.has(p)).length,
      total: list.length,
    })),
  };
}
