/**
 * NUR TESTDATEN: Der Inhaltskatalog, mit dem die Jest-Tests laufen
 * (`jest.setup.js` ersetzt `src/content/catalog.json` durch ihn).
 *
 * WARUM EIN FESTER TESTKATALOG: Die App kennt seit dem Sprach-Umbau
 * (23.09.2026) nur noch EINEN Datenweg — den Wortschatz im Katalog. Die
 * Tests sollen genau diesen Weg prüfen, aber mit stabilen, bekannten Wörtern
 * statt mit dem echten Bestand, der sich mit jedem Studio-Lauf ändert.
 * Grundlage ist der frühere, quellengeprüfte Grundstock
 * (`legacy-vocabulary.ts`); dazu ein daraus abgeleiteter deutscher Satz
 * (die deutsche Seite der Thai-Wörter), damit Deutsch als Lernsprache
 * ebenfalls Stoff hat.
 */
import type { ContentCatalog, ContentEntry } from '@/lib/content/types';
import type { VocabEntry } from '@/data/vocab-types';
import type { LearningStage } from '@/lib/learning-stages';

import { VOCABULARY, VOCABULARY_TH } from './legacy-vocabulary';

/** Deutsche Test-Wörter: die deutsche Seite der Thai-Einträge mit Thai als Anker. */
export const FIXTURE_GERMAN: VocabEntry[] = VOCABULARY_TH.filter((entry) => entry.german.trim()).map((anker) => ({
  ...anker,
  language: 'de',
  id: `de-${anker.id}`,
  concept: anker.id,
  term: anker.german,
  german: anker.german,
  romanization: '',
  syllables: [],
  // Die Vorderseite auf Thai-Oberfläche: das Thai-Wort.
  translations: { th: anker.term },
  exampleTerm: undefined,
  exampleRoman: undefined,
  exampleGerman: undefined,
  ipa: undefined,
  ipaAccent: undefined,
  ipaSyllables: undefined,
  tone: undefined,
  spanishNoun: undefined,
  spanishVerb: undefined,
  englishVerb: undefined,
  englishSpelling: undefined,
}));

/** Alle Test-Wörter: th/en/es aus dem früheren Grundstock plus Deutsch. */
export const FIXTURE_VOCABULARY: VocabEntry[] = [...VOCABULARY, ...FIXTURE_GERMAN];

export function fixtureEntry(word: VocabEntry): ContentEntry {
  return {
    kind: 'vocabulary',
    id: word.id,
    document: word,
    digest: 'fixture',
    check: { status: 'passed', label: 'automatisch geprüft', scope: 'schema-language', checkedAt: '2026-09-23T00:00:00.000Z' },
  };
}

export const FIXTURE_CATALOG: ContentCatalog = {
  version: 2,
  vocabularySource: 'generated',
  entries: FIXTURE_VOCABULARY.map(fixtureEntry),
};

/**
 * Der Testkatalog mit Wörtern mehrerer Stufen (18.10.2026): Die genannten
 * Einträge tragen ihre Stufe, alle anderen bleiben ohne Feld und gelten damit
 * als Anfänger — wie der echte Bestand vor den ersten Profi-Läufen.
 */
export function fixtureCatalogWithStages(stages: Readonly<Record<string, LearningStage>>): ContentCatalog {
  return {
    ...FIXTURE_CATALOG,
    entries: FIXTURE_VOCABULARY.map((word) =>
      fixtureEntry(stages[word.id] ? { ...word, learningStage: stages[word.id] } : word)),
  };
}
