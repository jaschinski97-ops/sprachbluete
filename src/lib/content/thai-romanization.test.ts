import catalog from '../../content/catalog.json';
import type { ContentCatalog } from './types';
import { romanSyllableProblem as problem, toneOfRoman as toneOf } from './thai-romanization';

// Gegen den echten Katalog: Die Thai-Umschrift folgt einer Konvention
// (Paiboon-Stil wie in den Dialogen: kh/th/ph, g/dt/bp, ɛ ɔ ə ʉ, Tonzeichen
// à â á ǎ). Bereinigt am 04.10.2026 — dieser Test hält den Stand.
jest.unmock('../../content/catalog.json');

const entries = (catalog as ContentCatalog).entries;
const thaiVocabulary = entries
  .filter((entry) => entry.kind === 'vocabulary' && (entry.document as { language?: string }).language === 'th')
  .map((entry) => entry.document as unknown as { id: string; term: string; romanization: string; syllables: { roman: string; tone: string }[] });

test('jede Thai-Silbe trägt das Tonzeichen ihres Tons', () => {
  const falsch = thaiVocabulary.flatMap((word) => word.syllables
    .filter((syllable) => toneOf(syllable.roman) !== syllable.tone)
    .map((syllable) => `${word.term}: ${syllable.roman} (${syllable.tone})`));
  expect(falsch).toEqual([]);
});

test('Umschrift und Silben einer Thai-Vokabel stimmen überein', () => {
  const falsch = thaiVocabulary
    .filter((word) => word.syllables.map((syllable) => syllable.roman).join('-') !== word.romanization)
    .map((word) => `${word.term}: ${word.romanization}`);
  expect(falsch).toEqual([]);
});

test('Thai-Silben folgen der Umschrift-Konvention', () => {
  const falsch = thaiVocabulary.flatMap((word) => word.syllables
    .map((syllable) => [syllable.roman, problem(syllable.roman)] as const)
    .filter(([, why]) => why)
    .map(([roman, why]) => `${word.term}: ${roman} — ${why}`));
  expect(falsch).toEqual([]);
});

test('keine Fremdzeichen in Thai-Umschriften (griechisches ε, æ, ʰ, Breve)', () => {
  const texte = entries.flatMap((entry) => {
    const doc = entry.document as Record<string, unknown>;
    if (entry.kind === 'vocabulary' && doc.language === 'th') return [doc.romanization, doc.exampleRoman] as unknown[];
    if (entry.kind === 'situations' && doc.direction === 'de_to_th') {
      return (doc.scriptTurns as { roman?: string }[]).map((turn) => turn.roman);
    }
    return [];
  }).filter((text): text is string => typeof text === 'string');
  expect(texte.filter((text) => /[Ͱ-Ͽἀ-῿æʰɯǽ̆]/.test(text))).toEqual([]);
});
