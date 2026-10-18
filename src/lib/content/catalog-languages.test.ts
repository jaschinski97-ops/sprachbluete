import { FIXTURE_CATALOG, FIXTURE_VOCABULARY } from '@/test-fixtures/fixture-catalog';

import { clipIdFor } from '../clips/types';
import { LANGUAGE_CODES, type LanguageCode } from '../languages/types';
import { MemoryDataStore } from '../storage';
import { isDeliverableEntry } from './audio-policy';
import type { ContentCatalog, ContentEntry } from './types';

// Katalog je Lernsprache: Der App-Build hat statt des Katalogs nur den Index
// im Modul und lädt die Sprachdateien selbst. Hier wird der Testkatalog mit
// demselben Erzeuger wie im Bau aufgeteilt und das Laden in eigenen
// Modulsätzen durchgespielt: einmal mit vollem Katalog (wie Entwicklung und
// Jest), einmal mit dem Index (wie im App-Build). Nichts hier importiert den
// Katalog im Hauptregister — Jest zöge sonst dessen Mock dem isolierten vor.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitCatalog } = require('../../../scripts/app-catalog-files.cjs') as {
  splitCatalog: (catalog: ContentCatalog, rules: unknown, sha: string) => { files: Record<LanguageCode, { entries: ContentEntry[] }>; index: ContentCatalog };
};

const T0 = Date.UTC(2026, 5, 1);
const SHA = 'f'.repeat(64);
const firstThai = FIXTURE_VOCABULARY.find((word) => word.language === 'th')!;
const clip = (language: LanguageCode, text: string): ContentEntry => ({
  kind: 'audio', id: clipIdFor(language, text), digest: 'd', asset: `${language}-${text.length}.mp3`,
  document: { id: clipIdFor(language, text), language } as ContentEntry['document'],
  check: { status: 'passed', label: 'automatisch geprüft', checkedAt: 'x', scope: 'schema-integrity-decode', tone: { status: 'not-applicable' } as never },
});
const MEANING_CLIP = clip('de', firstThai.german);
const CATALOG: ContentCatalog = { ...FIXTURE_CATALOG, entries: [...FIXTURE_CATALOG.entries, MEANING_CLIP] };
const MODULES: Record<LanguageCode, number> = { th: 1, en: 2, es: 3, de: 4 };
const BY_MODULE = Object.fromEntries(LANGUAGE_CODES.map((code) => [MODULES[code], code])) as Record<number, LanguageCode>;

/* eslint-disable @typescript-eslint/no-require-imports */
function build(catalogJson: ContentCatalog) {
  let modules!: {
    state: typeof import('./catalog-state');
    languages: typeof import('./catalog-languages');
    vocabulary: typeof import('../../data/active-vocabulary');
    bundled: typeof import('./bundled');
    plan: typeof import('./audio-plan');
    review: typeof import('../review-session');
    repository: typeof import('../repository');
    startup: typeof import('../startup-language');
    profile: typeof import('../profile');
  };
  jest.isolateModules(() => {
    jest.doMock('../../content/catalog.json', () => catalogJson);
    modules = {
      state: require('./catalog-state'),
      languages: require('./catalog-languages'),
      vocabulary: require('../../data/active-vocabulary'),
      bundled: require('./bundled'),
      plan: require('./audio-plan'),
      review: require('../review-session'),
      repository: require('../repository'),
      startup: require('../startup-language'),
      profile: require('../profile'),
    };
  });
  return modules;
}
/* eslint-enable @typescript-eslint/no-require-imports */

const full = build(CATALOG);
const { files, index } = splitCatalog(CATALOG, { languages: LANGUAGE_CODES, isDeliverableEntry, planDeliveryAudio: full.plan.planDeliveryAudio }, SHA);
const activeVocabularyFor = full.vocabulary.activeVocabularyFor;

type Reader = (moduleId: number) => Promise<{ text: string; assetMs: number; readMs: number }>;
const fileText = (code: LanguageCode) => JSON.stringify(files[code]);
const readFixture: Reader = async (moduleId) => ({ text: fileText(BY_MODULE[moduleId]), assetMs: 0, readMs: 0 });

function appBuild(read: Reader = readFixture) {
  const modules = build(index);
  modules.languages.setCatalogSource({ files: MODULES, read });
  return modules;
}

async function freshStore() {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

const ids = (words: { id: string }[]) => words.map((word) => word.id).sort();

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('ohne geladene Sprache: leerer Katalog, aber Anzahlen aus dem Index', () => {
  const app = appBuild();
  expect(app.state.isSplitCatalog()).toBe(true);
  expect(app.state.loadedLanguages()).toEqual([]);
  expect(app.vocabulary.activeVocabularyFor('th')).toEqual([]);
  for (const code of LANGUAGE_CODES) {
    expect(app.vocabulary.vocabularyCountFor(code)).toBe(activeVocabularyFor(code).length);
  }
  expect(app.vocabulary.activeVocabularyIds().size).toBe(FIXTURE_VOCABULARY.length);
});

test('eine geladene Sprache sieht die App wie mit vollem Katalog, samt deutschem Bedeutungs-Clip', async () => {
  const app = appBuild();
  await app.languages.ensureLanguages(['th']);
  expect(app.state.loadedLanguages()).toEqual(['th']);
  expect(ids(app.vocabulary.activeVocabularyFor('th'))).toEqual(ids(activeVocabularyFor('th')));
  expect(app.vocabulary.activeVocabularyFor('es')).toEqual([]);
  expect(app.bundled.bundledEntry('audio', MEANING_CLIP.id)?.asset).toBe(MEANING_CLIP.asset);
  expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[catalog\] th: asset \d+ ms, read \d+ ms, parse \d+ ms/));
});

test('gleichzeitige Anfragen lesen die Datei einmal; zwei Sprachen teilen den Clip ohne Doppel', async () => {
  const read = jest.fn(readFixture);
  const app = appBuild(read);
  await Promise.all([app.languages.ensureLanguages(['th']), app.languages.ensureLanguages(['th'])]);
  expect(read).toHaveBeenCalledTimes(1);
  await app.languages.ensureLanguages(['de']);
  const clips = app.state.currentCatalog().entries.filter((entry) => entry.id === MEANING_CLIP.id);
  expect(clips).toHaveLength(1);
});

test('höchstens zwei Sprachen; entladen wird die älteste, nie eine gehaltene', async () => {
  const app = appBuild();
  await app.languages.ensureLanguages(['th']);
  await app.languages.ensureLanguages(['es']);
  await app.languages.ensureLanguages(['de']);
  expect(app.state.loadedLanguages()).toEqual(['es', 'de']);

  const release = app.languages.holdLanguages(['es']);
  await app.languages.ensureLanguages(['th']);
  expect(app.state.loadedLanguages()).toEqual(['th', 'es']);
  // Hält ein dritter Bildschirm eine Sprache, sind es kurz drei.
  const releaseTh = app.languages.holdLanguages(['th']);
  await app.languages.ensureLanguages(['en']);
  expect(app.state.loadedLanguages()).toEqual(['th', 'en', 'es']);
  release();
  expect(app.state.loadedLanguages()).toEqual(['th', 'en']);
  releaseTh();
});

test.each([
  ['fehlende Datei', async () => { throw new Error('ENOENT'); }, /ENOENT/],
  ['kaputtes JSON', async () => ({ text: '{"format":1,', assetMs: 0, readMs: 0 }), /beschädigt/],
  ['fremder Katalogstand', async () => ({ text: JSON.stringify({ ...files.th, sourceCatalogSha256: 'alt' }), assetMs: 0, readMs: 0 }), /passt nicht zum Index/],
  ['falsche Sprache', async () => ({ text: fileText('es'), assetMs: 0, readMs: 0 }), /enthält es/],
] as const)('Fehlerweg: %s', async (_name, broken, message) => {
  const app = appBuild(broken as Reader);
  await expect(app.languages.ensureLanguages(['th'])).rejects.toThrow(message);
  expect(app.state.isLanguageLoaded('th')).toBe(false);
  // Erneut versuchen klappt, sobald die Datei stimmt.
  app.languages.setCatalogSource({ files: MODULES, read: readFixture });
  await app.languages.ensureLanguages(['th']);
  expect(app.state.isLanguageLoaded('th')).toBe(true);
});

test('Sprache ohne Datei im Build', async () => {
  const app = appBuild();
  app.languages.setCatalogSource({ files: {}, read: readFixture });
  await expect(app.languages.ensureLanguages(['th'])).rejects.toThrow(/Keine Sprachdatei für th/);
});

test('Zeitüberschreitung nach 10 s statt ewigem Splash', async () => {
  jest.useFakeTimers();
  try {
    const app = appBuild(() => new Promise(() => {}));
    const loading = app.languages.ensureLanguages(['th']);
    jest.advanceTimersByTime(app.languages.LOAD_TIMEOUT_MS);
    await expect(loading).rejects.toThrow(/länger als 10 s/);
  } finally {
    jest.useRealTimers();
  }
});

test('Fällig-Zahlen ungeladener Ziele: lesend gleich wie anlegend, ohne Karten zu schreiben', async () => {
  const app = appBuild();
  await app.languages.ensureLanguages(['th']);
  // Gleicher Lernstand in zwei Speichern: einige Karten bewertet, der Rest neu.
  const lesend = await freshStore();
  const anlegend = await freshStore();
  const { cards } = await app.review.ensureCardStates('en_to_es', anlegend, T0);
  for (const [i, card] of cards.slice(0, 3).entries()) {
    const bewertet = await app.repository.rateCard(card, (i + 2) as 2 | 3 | 4, anlegend, T0 - 5 * 86_400_000);
    await app.repository.saveCardState(bewertet, lesend);
  }

  expect(app.state.isLanguageLoaded('es')).toBe(true);
  await app.languages.ensureLanguages(['th']);
  await app.languages.ensureLanguages(['de']);
  expect(app.state.isLanguageLoaded('es')).toBe(false);

  const vorher = (await lesend.getAll('cards')).length;
  const ohne = await app.review.summarizeDirection('en_to_es', lesend, T0);
  expect((await lesend.getAll('cards')).length).toBe(vorher);
  expect(app.state.isLanguageLoaded('es')).toBe(false);

  const mit = await full.review.summarizeDirection('en_to_es', anlegend, T0);
  expect(ohne).toEqual(mit);
});

test('Datenpflege behält Wörter ungeladener Sprachen im Vokabelspeicher', async () => {
  const app = appBuild();
  const store = await freshStore();
  await app.repository.seedVocabulary(store, FIXTURE_VOCABULARY);
  await app.languages.ensureLanguages(['th']);
  await app.repository.loadVocabulary(store);
  expect((await store.getAll('vocab')).length).toBe(FIXTURE_VOCABULARY.length);
});

test('Ladetor: Lernsprache aus Lernstand, sonst Profil, nie die App-Sprache', async () => {
  const app = appBuild();
  const store = await freshStore();
  expect(await app.startup.startupLanguage('de', store)).toBe('th');
  expect(await app.startup.startupLanguage('th', store)).not.toBe('th');
  await app.profile.setLanguage('es', store);
  expect(await app.startup.startupLanguage('en', store)).toBe('es');
  await app.profile.setLanguage('de', store);
  await app.profile.setReviewSpot({ direction: 'en_to_de', mode: 'cards' }, store);
  // Der Stand wird auf die aktuelle Oberfläche umgelegt: de bleibt Ziel.
  expect(await app.startup.startupLanguage('th', store)).toBe('de');
});
