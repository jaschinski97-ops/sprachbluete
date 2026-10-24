import { FIXTURE_CATALOG, FIXTURE_VOCABULARY } from '@/test-fixtures/fixture-catalog';

import type { CatalogFileSet } from '../../content/catalog-files';
import { clipIdFor } from '../clips/types';
import { UI_LANGUAGES, type UiLanguage } from '../i18n/types';
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
const { slimEntry } = require('../../../scripts/metro-app-catalog.cjs') as { slimEntry: (entry: ContentEntry) => ContentEntry };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitCatalog } = require('../../../scripts/app-catalog-files.cjs') as {
  splitCatalog: (catalog: ContentCatalog, rules: unknown, sha: string) => {
    files: Record<LanguageCode, { entries: ContentEntry[] }>;
    translations: Record<LanguageCode, Record<UiLanguage, unknown>>;
    index: ContentCatalog;
  };
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
// Ein Wort mit Übersetzungen in mehreren App-Sprachen, damit die Teile etwas tragen.
const UEBERSETZT = { de: 'Hallo', en: 'hello', zh: '你好', th: 'สวัสดี', fr: 'bonjour' };
// Der Beispielsatz desselben Worts in mehreren App-Sprachen (24.10.2026).
const SATZ_UEBERSETZT = { de: 'Hallo, wie geht es?', en: 'Hello, how are you?', zh: '你好，你好吗？', fr: 'Bonjour, ça va ?' };
const CATALOG: ContentCatalog = {
  ...FIXTURE_CATALOG,
  entries: [
    ...FIXTURE_CATALOG.entries.map((entry) => entry.id === firstThai.id
      ? { ...entry, document: { ...entry.document, translations: UEBERSETZT, exampleTranslations: SATZ_UEBERSETZT } as ContentEntry['document'] }
      : entry),
    MEANING_CLIP,
  ],
};

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
    // Die ~19.000 Asset-Requires braucht hier niemand; je Modulsatz neu
    // geladen, trieben sie den Speicher eines Workers über 3 GB.
    jest.doMock('../../content/assets', () => ({ CONTENT_ASSETS: {} }));
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
const { files, translations, index } = splitCatalog(
  CATALOG, { languages: LANGUAGE_CODES, uiLanguages: UI_LANGUAGES, isDeliverableEntry, planDeliveryAudio: full.plan.planDeliveryAudio }, SHA);
const activeVocabularyFor = full.vocabulary.activeVocabularyFor;

// Je Datei eine Modulnummer wie bei Metro: Basis und 20 Übersetzungsteile je Lernsprache.
const TEXTS = new Map<number, string>();
const MODULES = {} as Record<LanguageCode, CatalogFileSet>;
for (const code of LANGUAGE_CODES) {
  const base = TEXTS.size + 1;
  TEXTS.set(base, JSON.stringify(files[code]));
  const parts = {} as Record<UiLanguage, number>;
  for (const ui of UI_LANGUAGES) {
    parts[ui] = TEXTS.size + 1;
    TEXTS.set(parts[ui], JSON.stringify(translations[code][ui]));
  }
  MODULES[code] = { base, translations: parts };
}

type Reader = (moduleId: number) => Promise<{ text: string; assetMs: number; readMs: number }>;
const fileText = (code: LanguageCode) => JSON.stringify(files[code]);
const readFixture: Reader = async (moduleId) => ({ text: TEXTS.get(moduleId)!, assetMs: 0, readMs: 0 });
/** Liest die Basis von `language` mit `broken`, alles andere wie gebaut. */
const brokenBase = (broken: Reader, language: LanguageCode = 'th'): Reader => (moduleId) =>
  moduleId === MODULES[language].base ? broken(moduleId) : readFixture(moduleId);

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

test('gleichzeitige Anfragen lesen jede Datei einmal; zwei Sprachen teilen den Clip ohne Doppel', async () => {
  const read = jest.fn(readFixture);
  const app = appBuild(read);
  await Promise.all([app.languages.ensureLanguages(['th']), app.languages.ensureLanguages(['th'])]);
  // Basis und englischer Teil, je einmal.
  expect(read.mock.calls.map(([id]) => id).sort((a, b) => a - b)).toEqual([MODULES.th.base, MODULES.th.translations.en]);
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
  ['kaputtes JSON', async () => ({ text: '{"format":2,', assetMs: 0, readMs: 0 }), /beschädigt/],
  ['fremder Katalogstand', async () => ({ text: JSON.stringify({ ...files.th, sourceCatalogSha256: 'alt' }), assetMs: 0, readMs: 0 }), /passt nicht zum Index/],
  ['falsche Sprache', async () => ({ text: fileText('es'), assetMs: 0, readMs: 0 }), /enthält es/],
  ['altes Format', async () => ({ text: JSON.stringify({ ...files.th, format: 1 }), assetMs: 0, readMs: 0 }), /unbekanntes Format/],
] as const)('Fehlerweg: %s', async (_name, broken, message) => {
  const app = appBuild(brokenBase(broken as Reader));
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
  await expect(app.languages.ensureLanguages(['th'])).rejects.toThrow(/Keine Sprachdatei th/);
});

test('Schritt 1b: nur App-Sprache und Englisch, beim Wechsel nachgeladen und an Ort und Stelle ergänzt', async () => {
  const read = jest.fn(readFixture);
  const app = appBuild(read);
  await app.languages.setCatalogUiLanguage('zh');
  await app.languages.ensureLanguages(['th']);
  expect(read.mock.calls.map(([id]) => id).sort((a, b) => a - b)).toEqual(
    [MODULES.th.base, MODULES.th.translations.en, MODULES.th.translations.zh].sort((a, b) => a - b));

  const word = app.vocabulary.activeVocabularyFor('th').find((entry) => entry.id === firstThai.id)!;
  const vorlage = activeVocabularyFor('th').find((entry) => entry.id === firstThai.id)!;
  expect(word.translations).toEqual({ en: 'hello', zh: '你好' });
  expect(vorlage.translations).toEqual(UEBERSETZT);

  const revision = app.state.catalogRevision();
  await app.languages.setCatalogUiLanguage('th');
  expect(app.state.catalogRevision()).toBeGreaterThan(revision);
  expect(read).toHaveBeenCalledWith(MODULES.th.translations.th);
  const danach = app.vocabulary.activeVocabularyFor('th').find((entry) => entry.id === firstThai.id)!;
  expect(danach.translations).toEqual({ en: 'hello', zh: '你好', th: 'สวัสดี' });
  // Englisch wird nicht ein zweites Mal gelesen.
  expect(read.mock.calls.filter(([id]) => id === MODULES.th.translations.en)).toHaveLength(1);
});

test('Satzübersetzungen kommen wie die Wortübersetzungen je App-Sprache', async () => {
  // Die Basis trägt keine Satzübersetzung einer App-Sprache.
  expect(fileText('th')).not.toContain(SATZ_UEBERSETZT.zh);
  expect(JSON.stringify(translations.th.zh)).toContain(SATZ_UEBERSETZT.zh);
  expect(JSON.stringify(translations.th.fr)).not.toContain(SATZ_UEBERSETZT.zh);

  const app = appBuild();
  await app.languages.setCatalogUiLanguage('zh');
  await app.languages.ensureLanguages(['th']);
  const word = () => app.vocabulary.activeVocabularyFor('th').find((entry) => entry.id === firstThai.id)!;
  expect(word().exampleTranslations).toEqual({ en: SATZ_UEBERSETZT.en, zh: SATZ_UEBERSETZT.zh });
  await app.languages.setCatalogUiLanguage('fr');
  expect(word().exampleTranslations).toEqual({ en: SATZ_UEBERSETZT.en, zh: SATZ_UEBERSETZT.zh, fr: SATZ_UEBERSETZT.fr });
  // Der volle Katalog (Entwicklung) trägt alle.
  expect(activeVocabularyFor('th').find((entry) => entry.id === firstThai.id)!.exampleTranslations).toEqual(SATZ_UEBERSETZT);
});

test('Schritt 1b: Clips aus der Tabelle sind dieselben Einträge wie im vollen Katalog', async () => {
  const app = appBuild();
  await app.languages.ensureLanguages(['th']);
  expect(app.bundled.bundledEntry('audio', MEANING_CLIP.id)).toEqual(slimEntry(MEANING_CLIP));
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
