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

/**
 * Whole-word pronunciations for common words the letter rules get wrong.
 *
 * English spelling hides several phonemes entirely: nothing in the alphabet
 * spells AY, DH, UH or ZH reliably, so without these the inventory can never
 * be completed no matter what is read — the progress bar would stall short of
 * 100% forever. These are the high-frequency words that carry those sounds.
 */
const WORD_SOUNDS: Record<string, string[]> = {
  // AY
  i: ['AY'],
  im: ['AY', 'M'],
  id: ['AY', 'D'],
  my: ['M', 'AY'],
  like: ['L', 'AY', 'K'],
  time: ['T', 'AY', 'M'],
  night: ['N', 'AY', 'T'],
  goodnight: ['G', 'UH', 'D', 'N', 'AY', 'T'],
  right: ['R', 'AY', 'T'],
  light: ['L', 'AY', 'T'],
  tired: ['T', 'AY', 'ER', 'D'],
  while: ['W', 'AY', 'L'],
  // DH
  the: ['DH', 'AH'],
  this: ['DH', 'IH', 'S'],
  that: ['DH', 'AE', 'T'],
  thats: ['DH', 'AE', 'T', 'S'],
  they: ['DH', 'EY'],
  them: ['DH', 'EH', 'M'],
  there: ['DH', 'EH', 'R'],
  then: ['DH', 'EH', 'N'],
  with: ['W', 'IH', 'DH'],
  other: ['AH', 'DH', 'ER'],
  another: ['AH', 'N', 'AH', 'DH', 'ER'],
  // UH
  could: ['K', 'UH', 'D'],
  would: ['W', 'UH', 'D'],
  should: ['SH', 'UH', 'D'],
  put: ['P', 'UH', 'T'],
  look: ['L', 'UH', 'K'],
  good: ['G', 'UH', 'D'],
  // ZH
  television: ['T', 'EH', 'L', 'AH', 'V', 'IH', 'ZH', 'AH', 'N'],
  usually: ['Y', 'UW', 'ZH', 'AH', 'L', 'IY'],
  measure: ['M', 'EH', 'ZH', 'ER'],
  // Z, hidden behind a written 's'
  please: ['P', 'L', 'IY', 'Z'],
  is: ['IH', 'Z'],
  was: ['W', 'AA', 'Z'],
  as: ['AE', 'Z'],
  his: ['HH', 'IH', 'Z'],
  has: ['HH', 'AE', 'Z'],
  does: ['D', 'AH', 'Z'],
  these: ['DH', 'IY', 'Z'],
  those: ['DH', 'OW', 'Z'],
  glasses: ['G', 'L', 'AE', 'S', 'IH', 'Z'],
};

/** Approximate the phoneme set present in a stretch of text. */
export function phonemesIn(text: string): Set<string> {
  const found = new Set<string>();
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);

  for (const word of words) {
    if (!word) continue;

    const known = WORD_SOUNDS[word];
    if (known) {
      known.forEach((p) => found.add(p));
      continue;
    }

    let rest = word;
    while (rest.length > 0) {
      const rule = RULES.find(([pattern]) => pattern.test(rest));
      if (!rule) {
        rest = rest.slice(1);
        continue;
      }
      rule[1].forEach((p) => found.add(p));
      rest = rest.replace(rule[0], '');
    }
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
