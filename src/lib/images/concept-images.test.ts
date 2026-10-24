import { VOCABULARY_TH, VocabEntry } from '@/test-fixtures/legacy-vocabulary';
import { FIXTURE_CATALOG, fixtureEntry } from '@/test-fixtures/fixture-catalog';

import { setCurrentCatalog } from '../content/catalog-state';
import { countImagesByLanguage, loadVocabImageUri } from '../repository';
import { DataStore, MemoryDataStore } from '../storage';

import { missingImageSpecs, runImageBatch } from './batch';
import { MemoryImageBlobStore } from './blob-memory';
import {
  imageCandidateIds,
  imageIdFor,
  imageInLanguageSelection,
  imageLanguagesOf,
  imageOrphanedBy,
} from './concept-images';
import { buildImagePrompt, ImageGenerationClient } from './generator';
import { parseOwnConcepts, loadOwnImageConcepts, saveOwnImageConcepts } from './own-concepts';
import { canHaveImage, planImages, summarizeImagePlan } from './plan';
import { GeneratedImage, ImageSpec, VocabImage } from './types';

/**
 * Bilder je Begriff (24.10.2026): Apfel, apple, manzana und แอปเปิ้ล teilen
 * ein Bild; eine Sprach-Ausnahme gewinnt in ihrer Sprache.
 */

const FAKE_BASE64 = 'UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73v/+BiOh/AAA'.repeat(4);
const BASE = VOCABULARY_TH.find((entry) => entry.isConcrete)!;

function word(id: string, language: VocabEntry['language'], term: string, concept: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return { ...BASE, id, language, term, concept, isConcrete: true, partOfSpeech: 'noun', translations: { en: 'apple' }, ...extra } as VocabEntry;
}

const TH_APPLE = word('ki-th-apple', 'th', 'แอปเปิ้ล', 'c:apple');
const EN_APPLE = word('ki-en-apple', 'en', 'apple', 'c:apple');
const ES_APPLE = word('ki-es-manzana', 'es', 'manzana', 'c:apple');
const ES_MONEY = word('ki-es-dinero', 'es', 'dinero', 'c:money', { translations: { en: 'money' } });
const TH_MONEY = word('ki-th-money', 'th', 'เงิน', 'c:money', { translations: { en: 'money' } });
const EN_BANK = word('ki-en-bank', 'en', 'bank', 'c:bank_money', { translations: { en: 'bank' } });
const WORDS = [TH_APPLE, EN_APPLE, ES_APPLE, ES_MONEY, TH_MONEY, EN_BANK];

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function client(): ImageGenerationClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generate(spec: ImageSpec): Promise<GeneratedImage> {
      calls.push(spec.id);
      return { base64: FAKE_BASE64, format: 'webp', model: 'test', prompt: buildImagePrompt(spec) };
    },
  };
}

beforeEach(() => setCurrentCatalog({ ...FIXTURE_CATALOG, entries: [...FIXTURE_CATALOG.entries, ...WORDS.map(fixtureEntry)] }));
afterEach(() => setCurrentCatalog(FIXTURE_CATALOG));

describe('Bild-IDs je Begriff', () => {
  test('Begriff, Ausnahme und alter Bestand', () => {
    expect(imageIdFor('c:apple')).toBe('concept-apple');
    expect(imageIdFor('c:bank_money', 'th')).toBe('concept-bank_money-th');
    expect(imageIdFor('nam')).toBe('nam');
  });

  test('ein Wort sucht Ausnahme, dann gemeinsames Bild, dann sein altes Bild', () => {
    expect(imageCandidateIds(TH_APPLE)).toEqual(['concept-apple-th', 'concept-apple', 'ki-th-apple']);
    expect(imageCandidateIds({ id: 'nam', concept: 'nam', language: 'th' })).toEqual(['nam']);
  });

  test('ein gemeinsames Bild zeigen alle Sprachen mit diesem Begriff', () => {
    const shared = { id: 'concept-apple', vocabId: 'ki-en-apple', concept: 'c:apple' };
    expect(imageLanguagesOf(shared, WORDS)).toEqual(['en', 'es', 'th']);
    expect(imageLanguagesOf({ ...shared, id: 'concept-apple-th', language: 'th' }, WORDS)).toEqual(['th']);
    expect(imageLanguagesOf({ id: 'ki-th-apple', vocabId: 'ki-th-apple' }, WORDS)).toEqual(['th']);
  });

  test('Thai-Bilder löschen nimmt Englisch und Spanisch ihr gemeinsames Bild nicht', () => {
    const shared = { id: 'concept-apple', vocabId: 'ki-en-apple', concept: 'c:apple' };
    expect(imageInLanguageSelection(shared, WORDS, ['th'])).toBe(false);
    expect(imageInLanguageSelection(shared, WORDS, ['th', 'en', 'es'])).toBe(true);
    expect(imageInLanguageSelection({ ...shared, id: 'concept-apple-th', language: 'th' }, WORDS, ['th'])).toBe(true);
    expect(imageInLanguageSelection({ id: 'ki-th-apple', vocabId: 'ki-th-apple' }, WORDS, ['th'])).toBe(true);
  });

  test('ein Begriffsbild geht erst mit dem letzten Wort seines Begriffs', () => {
    const shared = { id: 'concept-apple', vocabId: 'ki-th-apple', concept: 'c:apple' };
    expect(imageOrphanedBy(shared, new Set(['ki-th-apple']), WORDS)).toBe(false);
    expect(imageOrphanedBy(shared, new Set(['ki-th-apple', 'ki-en-apple', 'ki-es-manzana']), WORDS)).toBe(true);
    expect(imageOrphanedBy({ ...shared, id: 'concept-apple-th', language: 'th' }, new Set(['ki-th-apple']), WORDS)).toBe(true);
    expect(imageOrphanedBy({ id: 'ki-th-apple', vocabId: 'ki-th-apple' }, new Set(['ki-th-apple']), WORDS)).toBe(true);
  });
});

describe('Planung je Begriff', () => {
  test('ein gemeinsamer Begriff reicht für ein Bild', () => {
    expect(canHaveImage(word('ki-th-x', 'th', 'x', 'c:chair'))).toBe(true);
    expect(canHaveImage(word('ki-th-y', 'th', 'y', 'c:chair', { isConcrete: false }))).toBe(false);
  });

  test('Synonyme eines Begriffs teilen einen Auftrag; das Motiv ist englisch und ohne Schrift', () => {
    const synonym = word('ki-th-apple-2', 'th', 'ลูกแอปเปิ้ล', 'c:apple');
    const specs = planImages({ entries: [TH_APPLE, synonym, TH_MONEY], motifWords: WORDS });
    expect(specs.map((spec) => spec.id)).toEqual(['concept-apple', 'concept-money']);
    expect(specs[0]).toMatchObject({ vocabId: 'ki-th-apple', concept: 'c:apple' });
    expect(specs[0].language).toBeUndefined();
    expect(specs[0].motif).toContain('A typical apple');
    expect(specs[0].motif).toContain('never write the word');
  });

  test('die Bedeutungsangabe im Begriff landet im Motiv', () => {
    const [spec] = planImages({ entries: [EN_BANK], motifWords: WORDS });
    expect(spec.motif).toContain('bank (money)');
  });

  test('derselbe Begriff ergibt in jeder Sprache dieselbe Bild-ID', () => {
    const ids = [TH_APPLE, EN_APPLE, ES_APPLE].map((entry) => planImages({ entries: [entry], motifWords: WORDS })[0].id);
    expect(new Set(ids)).toEqual(new Set(['concept-apple']));
  });

  test('Sprach-Ausnahme: eigenes Bild nur für diese Sprache, landestypisch', () => {
    const specs = planImages({ entries: [ES_APPLE, ES_MONEY], ownImageConcepts: ['Money'], motifWords: WORDS });
    expect(specs.map((spec) => spec.id)).toEqual(['concept-apple', 'concept-money-es']);
    expect(specs[1]).toMatchObject({ concept: 'c:money', language: 'es' });
    expect(specs[1].motif).toContain('Spain');
  });

  test('die Planung zählt, was vorhandene Begriffe sparen', () => {
    const entries = [ES_APPLE, ES_MONEY, word('ki-es-manzana-2', 'es', 'poma', 'c:apple')];
    const summary = summarizeImagePlan({ entries, motifWords: WORDS, existingIds: new Set(['concept-apple']) });
    expect(summary).toEqual({ words: 3, images: 2, existing: 1, toGenerate: 1, saved: 2 });
  });
});

describe('Lauf und Bildsuche über Sprachen hinweg', () => {
  test('ein Bild aus dem Thai-Lauf deckt Englisch und Spanisch: nichts wird doppelt bezahlt', async () => {
    const store = await freshStore();
    const blobs = new MemoryImageBlobStore();
    const thai = client();
    await runImageBatch({ specs: planImages({ entries: [TH_APPLE], motifWords: WORDS }), client: thai, store, blobStore: blobs });
    expect(thai.calls).toEqual(['concept-apple']);
    const doc = await store.get<VocabImage>('images', 'concept-apple');
    expect(doc).toMatchObject({ concept: 'c:apple', vocabId: 'ki-th-apple', blobKey: 'concept-apple.webp' });

    // Spanisch plant denselben Begriff — mit anderem Anker und Prompt, trotzdem vorhanden.
    const spanish = planImages({ entries: [ES_APPLE, ES_MONEY], motifWords: WORDS });
    expect((await missingImageSpecs(spanish, store, blobs)).map((spec) => spec.id)).toEqual(['concept-money']);
  });

  test('ein Wort in Sprache B bekommt das Bild aus Sprache A über seinen Begriff', async () => {
    const store = await freshStore();
    const blobs = new MemoryImageBlobStore();
    await runImageBatch({ specs: planImages({ entries: [TH_APPLE], motifWords: WORDS }), client: client(), store, blobStore: blobs });
    const thaiUri = await loadVocabImageUri(TH_APPLE, store, blobs);
    expect(thaiUri).not.toBeNull();
    expect(await loadVocabImageUri(ES_APPLE, store, blobs)).toBe(thaiUri);
    expect(await loadVocabImageUri(EN_APPLE, store, blobs)).toBe(thaiUri);
    // Ohne Begriff (alte Aufrufe mit nackter ID) bleibt es beim Bild des Worts.
    expect(await loadVocabImageUri('ki-es-manzana', store, blobs)).toBeNull();
  });

  test('die Sprach-Ausnahme gewinnt in ihrer Sprache, die anderen behalten das gemeinsame Bild', async () => {
    const store = await freshStore();
    const blobs = new MemoryImageBlobStore();
    await runImageBatch({ specs: planImages({ entries: [TH_MONEY], motifWords: WORDS }), client: client(), store, blobStore: blobs });
    await runImageBatch({
      specs: planImages({ entries: [ES_MONEY], ownImageConcepts: ['c:money'], motifWords: WORDS }),
      client: client(), store, blobStore: blobs,
    });
    expect(await store.get<VocabImage>('images', 'concept-money-es')).toMatchObject({ concept: 'c:money', language: 'es' });
    const shared = await loadVocabImageUri(TH_MONEY, store, blobs);
    const own = await loadVocabImageUri(ES_MONEY, store, blobs);
    expect(shared).toBe(await blobs.uri('concept-money.webp'));
    expect(own).toBe(await blobs.uri('concept-money-es.webp'));
  });

  test('alte Bilder je Wort bleiben gültig', async () => {
    const store = await freshStore();
    const blobs = new MemoryImageBlobStore();
    await blobs.put('ki-th-apple.webp', FAKE_BASE64);
    await store.put('images', 'ki-th-apple', {
      id: 'ki-th-apple', vocabId: 'ki-th-apple', format: 'webp', byteSize: 1, blobKey: 'ki-th-apple.webp', prompt: '', model: 'alt', generatedAt: 1,
    } satisfies VocabImage);
    expect(await loadVocabImageUri(TH_APPLE, store, blobs)).toBe(await blobs.uri('ki-th-apple.webp'));
    expect(await loadVocabImageUri(ES_APPLE, store, blobs)).toBeNull();
  });

  test('die Studio-Zähler zählen Wörter mit Bild je Sprache, auch über den Begriff', async () => {
    const store = await freshStore();
    const blobs = new MemoryImageBlobStore();
    await runImageBatch({ specs: planImages({ entries: [TH_APPLE], motifWords: WORDS }), client: client(), store, blobStore: blobs });
    const counts = await countImagesByLanguage(store);
    expect(counts).toMatchObject({ th: 1, en: 1, es: 1 });
  });
});

describe('Sprach-Ausnahmen im Studio', () => {
  test('Eingabe wird zu Begriffen', () => {
    expect(parseOwnConcepts('Geld, c:food; Bank (money)\nc:food')).toEqual(['c:geld', 'c:food', 'c:bank_money']);
  });

  test('je Lernsprache gespeichert', async () => {
    const store = await freshStore();
    await saveOwnImageConcepts('es', ['c:money'], store);
    await saveOwnImageConcepts('th', ['c:food', 'c:food'], store);
    expect(await loadOwnImageConcepts(store)).toEqual({ es: ['c:money'], th: ['c:food'] });
  });
});
