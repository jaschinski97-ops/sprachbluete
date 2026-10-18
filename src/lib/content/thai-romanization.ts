/**
 * Die Thai-Umschrift-Konvention der App (Paiboon-Stil wie in den Dialogen:
 * kh/th/ph, g/dt/bp, ɛ ɔ ə ʉ, Tonzeichen à â á ǎ). Bereinigt am 04.10.2026;
 * der Wächtertest `thai-romanization.test.ts` hält damit den Katalog, seit
 * 18.10.2026 auch die festen Daten von Kapitel 0 (Zahlen, Konsonantennamen).
 */

const TONE_MARK: Record<string, string> = { '̀': 'low', '̂': 'falling', '́': 'high', '̌': 'rising' };

/** Der Ton einer umschriebenen Silbe, gelesen an ihrem Tonzeichen. */
export function toneOfRoman(syllable: string): string {
  for (const ch of syllable.normalize('NFD')) if (TONE_MARK[ch]) return TONE_MARK[ch];
  return 'mid';
}

const VOWELS = 'aeiouɛɔəʉ';
const CANON_VOWELS = new Set(['a', 'aa', 'i', 'ii', 'u', 'uu', 'e', 'ee', 'ɛ', 'ɛɛ', 'o', 'oo', 'ɔ', 'ɔɔ', 'ə', 'əə', 'ʉ', 'ʉʉ',
  'ia', 'ʉa', 'ua', 'ai', 'aai', 'ao', 'aao', 'iu', 'eo', 'eeo', 'ɛo', 'ɛɛo', 'iao', 'ɔi', 'ɔɔi', 'ooi', 'oi', 'ui', 'uui',
  'əi', 'əəi', 'uai', 'ʉai', 'ʉʉai']);
const INITIAL = /^(kh|ph|th|ch|ng|bp|dt|g|j|b|d|m|n|l|r|s|h|f|w|y|)(r|l|w)?$/;
const FINALS = new Set(['', 'p', 't', 'k', 'm', 'n', 'ng']);

/** Was an einer Silbe gegen die Konvention verstößt — `null`, wenn nichts. */
export function romanSyllableProblem(syllable: string): string | null {
  const bare = syllable.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = bare.match(new RegExp(`^([^${VOWELS}]*)([${VOWELS}]+)(.*)$`));
  if (!match) return 'kein Vokal';
  const [, initial, vowel, final] = match;
  if (!INITIAL.test(initial) || ['k', 't', 'p'].includes(initial)) return `Anlaut ${initial}`;
  if (!CANON_VOWELS.has(vowel)) return `Vokal ${vowel}`;
  if (!FINALS.has(final)) return `Auslaut ${final}`;
  return null;
}
