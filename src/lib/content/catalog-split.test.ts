import catalog from '../../content/catalog.json';
import { UI_LANGUAGES, type UiLanguage } from '../i18n/types';
import { LANGUAGE_CODES, type LanguageCode } from '../languages/types';
import { planDeliveryAudio } from './audio-plan';
import { isDeliverableEntry } from './audio-policy';
import { audioEntryFromRow } from './catalog-languages';
import type { AudioRow, ContentCatalog, ContentEntry } from './types';

// Katalog je Lernsprache am ECHTEN Katalog: Die Sprachdateien zusammen sind
// genau die schlanke App-Fassung, jede Datei trägt jeden Clip, den ihre
// Sprache abspielen kann (auch die deutschen Bedeutungen), und der Index
// zählt wie der volle Katalog.
jest.unmock('../../content/catalog.json');
// Vergleiche mit dem echten Katalog brauchen Inhalt; solange er leer ist
// (frischer Neuaufbau ab 24.10.2026), werden sie übersprungen.
const mitInhalt = (catalog as { entries: unknown[] }).entries.length > 0;
const testMitInhalt = mitInhalt ? test : test.skip;
/* eslint-disable @typescript-eslint/no-require-imports */
const { splitCatalog } = require('../../../scripts/app-catalog-files.cjs') as {
  splitCatalog: (value: ContentCatalog, rules: unknown, sha: string) => {
    files: Record<LanguageCode, { entries: ContentEntry[]; audio: AudioRow[] }>;
    translations: Record<LanguageCode, Record<UiLanguage, {
      vocabulary: Record<string, unknown>; situations: Record<string, unknown>; exampleTranslations?: Record<string, unknown>;
    }>>;
    index: ContentCatalog & { appIndex: { languages: Record<LanguageCode, { vocabulary: string[] }> } };
  };
};
const { slimCatalog } = require('../../../scripts/metro-app-catalog.cjs') as { slimCatalog: (value: ContentCatalog) => ContentCatalog };
/* eslint-enable @typescript-eslint/no-require-imports */

const full = catalog as unknown as ContentCatalog;
const { files, translations, index } = splitCatalog(full, { languages: LANGUAGE_CODES, uiLanguages: UI_LANGUAGES, isDeliverableEntry, planDeliveryAudio }, 'sha');
const key = (entry: ContentEntry) => `${entry.kind}:${entry.id}`;

/** Eine Lernsprache wie die Laufzeit sie zusammensetzt, hier mit ALLEN App-Sprachen. */
function assembled(code: LanguageCode): ContentEntry[] {
  const entries: ContentEntry[] = JSON.parse(JSON.stringify([...files[code].entries, ...files[code].audio.map(audioEntryFromRow)]));
  const byKey = new Map(entries.map((entry) => [key(entry), entry]));
  for (const ui of UI_LANGUAGES) {
    for (const kind of ['vocabulary', 'situations'] as const) {
      for (const [id, value] of Object.entries(translations[code][ui][kind])) {
        const document = byKey.get(`${kind}:${id}`)!.document as { translations?: Record<string, unknown> };
        (document.translations ??= {})[ui] = value;
      }
    }
    for (const [id, value] of Object.entries(translations[code][ui].exampleTranslations ?? {})) {
      const document = byKey.get(`vocabulary:${id}`)!.document as { exampleTranslations?: Record<string, unknown> };
      (document.exampleTranslations ??= {})[ui] = value;
    }
  }
  return entries;
}

test('die Sprachdateien zusammen sind genau die schlanke App-Fassung', () => {
  const union = new Map<string, ContentEntry>();
  for (const code of LANGUAGE_CODES) {
    for (const entry of assembled(code)) {
      const previous = union.get(key(entry));
      if (previous) expect(entry).toEqual(previous);
      else union.set(key(entry), entry);
    }
  }
  const slim = slimCatalog(full).entries;
  expect(union.size).toBe(slim.length);
  for (const entry of slim) expect(union.get(key(entry))).toEqual(entry);
  expect(index.deleted).toEqual(full.deleted);
  expect(index.clearedBefore).toEqual(full.clearedBefore);
  expect(index.entries).toEqual([]);
});

testMitInhalt('jede Datei trägt alle Clips, die ihre Lernsprache abspielen kann', () => {
  for (const code of LANGUAGE_CODES) {
    const own = new Set(assembled(code).map(key));
    const words = full.entries
      .filter((entry) => entry.kind === 'vocabulary' && isDeliverableEntry(entry))
      .map((entry) => entry.document as never);
    const situations = full.entries
      .filter((entry) => entry.kind === 'situations' && isDeliverableEntry(entry))
      .map((entry) => entry.document as { direction: string })
      .filter((situation) => situation.direction.split('_to_')[1] === code);
    const shipped = new Set(full.entries.filter((entry) => entry.kind === 'audio').map((entry) => entry.id));
    const planned = planDeliveryAudio(situations as never, code, words).map((spec) => spec.id).filter((id) => shipped.has(id));
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.filter((id) => !own.has(`audio:${id}`))).toEqual([]);
  }
});

test('der Index zählt den auslieferbaren Wortschatz wie der volle Katalog', () => {
  for (const code of LANGUAGE_CODES) {
    const expected = [...new Map(full.entries
      .filter((entry) => entry.kind === 'vocabulary' && isDeliverableEntry(entry))
      .map((entry) => [entry.id, entry.document as { language: string }])).entries()]
      .filter(([, word]) => word.language === code).map(([id]) => id);
    expect(index.appIndex.languages[code].vocabulary).toEqual(expected);
  }
});

test('was eine Lernsprache mit einer App-Sprache lädt, ist ein Bruchteil der App-Fassung', () => {
  const slim = JSON.stringify(slimCatalog(full)).length;
  for (const code of LANGUAGE_CODES) {
    const geladen = [files[code], translations[code].zh, translations[code].en].map((file) => JSON.stringify(file).length);
    expect(geladen.reduce((sum, chars) => sum + chars, 0)).toBeLessThan(slim / 4);
  }
});

testMitInhalt('Satzübersetzungen (exampleTranslations) wandern je App-Sprache in die Teile', () => {
  const wort = full.entries.find((entry) => entry.kind === 'vocabulary' && isDeliverableEntry(entry))!;
  const code = (wort.document as { language: LanguageCode }).language;
  const saetze = { de: 'Satz de', en: 'Satz en', zh: 'Satz zh' };
  const klein: ContentCatalog = {
    ...full,
    entries: [{ ...wort, document: { ...wort.document, exampleTranslations: saetze } as ContentEntry['document'] }],
  };
  const geteilt = splitCatalog(klein, { languages: LANGUAGE_CODES, uiLanguages: UI_LANGUAGES, isDeliverableEntry, planDeliveryAudio }, 'sha');
  const basis = geteilt.files[code].entries.find((entry) => entry.id === wort.id)!.document as { exampleTranslations?: unknown };
  expect(basis.exampleTranslations).toEqual({});
  expect(geteilt.translations[code].zh.exampleTranslations).toEqual({ [wort.id]: 'Satz zh' });
  expect(geteilt.translations[code].de.exampleTranslations).toEqual({ [wort.id]: 'Satz de' });
  expect(geteilt.translations[code].fr.exampleTranslations).toEqual({});
});
