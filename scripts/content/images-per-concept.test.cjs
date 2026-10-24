// Bilder je Begriff (24.10.2026): Helper-Vertrag, Löschen, Sprachpakete und
// Katalog-Aufteilung für gemeinsame Begriffsbilder und Sprach-Ausnahmen.
// Lauf: node --test scripts/content/images-per-concept.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ContentPipeline, assertDocument } = require('./pipeline.cjs');
const { checkContent } = require('./check.cjs');
const { selectPackEntries } = require('./build-pack.cjs');
const { splitCatalog } = require('../app-catalog-files.cjs');
const domain = require('./domain.cjs');
const { VOCABULARY } = domain.load('src/test-fixtures/legacy-vocabulary');

const enWord = (id, term, concept) => ({
  id, language: 'en', term, german: term, romanization: term, concept,
  partOfSpeech: 'noun', register: 'neutral', isConcrete: true,
  syllables: [], sourceVerified: false, verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
});
const thLamp = { ...VOCABULARY.find((word) => word.isConcrete), id: 'ki-th-lamp', concept: 'c:lamp' };

async function setup(t, extraVocabulary = VOCABULARY) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-concept-images-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, pipeline: new ContentPipeline(root, { extraVocabulary }) };
}

async function stageImage(pipeline, document) {
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  return pipeline.stage({
    kind: 'images',
    document: { format: 'png', byteSize: bytes.length, blobKey: document.id + '.png', prompt: 'TEST lamp, no text', model: 'TEST', generatedAt: 1, ...document },
    base64: bytes.toString('base64'),
  });
}

test('Vertrag: Begriffsbild braucht passende ID und ein konkretes Wort des Begriffs', () => {
  const words = [enWord('ki-en-lamp', 'lamp', 'c:lamp'), thLamp];
  const doc = { id: 'concept-lamp', vocabId: 'ki-en-lamp', concept: 'c:lamp', format: 'png', byteSize: 1, blobKey: 'x.png', prompt: 'p', model: 'm', generatedAt: 1 };
  assert.doesNotThrow(() => assertDocument('images', doc, words));
  assert.doesNotThrow(() => assertDocument('images', { ...doc, id: 'concept-lamp-th', language: 'th' }, words));
  assert.throws(() => assertDocument('images', { ...doc, id: 'concept-lampe' }, words), /images-Vertrag/);
  assert.throws(() => assertDocument('images', { ...doc, id: 'concept-lamp-es', language: 'es' }, words), /images-Vertrag/);
  assert.throws(() => assertDocument('images', { ...doc, concept: 'c:chair', id: 'concept-chair' }, words), /images-Vertrag/);
  assert.throws(() => assertDocument('images', { ...doc, id: 'concept-lamp-xx', language: 'xx' }, words), /images-Vertrag/);
});

test('ein Begriffsbild bleibt, bis das letzte Wort seines Begriffs gelöscht ist', async (t) => {
  const { root, pipeline } = await setup(t);
  await pipeline.stage({ kind: 'vocabulary', document: enWord('ki-en-lamp', 'lamp', 'c:lamp') });
  await pipeline.stage({ kind: 'vocabulary', document: enWord('ki-en-light', 'light', 'c:lamp') });
  await pipeline.publish();
  const bild = await stageImage(pipeline, { id: 'concept-lamp', vocabId: 'ki-en-lamp', concept: 'c:lamp' });
  await pipeline.publish();
  const report = checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY });
  assert.deepEqual(report.errors, []);
  assert.ok(!report.missing.images.includes('ki-en-light'), 'das Synonym zeigt das Begriffsbild');

  await pipeline.deleteFromCatalog('vocabulary', 'ki-en-lamp');
  assert.ok((await pipeline.catalog()).entries.some((entry) => entry.id === 'concept-lamp'), 'das Synonym nutzt das Bild noch');
  await pipeline.publish();
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);

  await pipeline.deleteFromCatalog('vocabulary', 'ki-en-light');
  const katalog = await pipeline.catalog();
  assert.equal(katalog.entries.length, 0);
  assert.ok(katalog.deleted['images:concept-lamp']);
  await assert.rejects(fs.readFile(path.join(root, 'assets/content', bild.asset)));
});

test('Löschen nach Sprache nimmt ein gemeinsames Bild nur mit, wenn alle Sprachen gewählt sind', async (t) => {
  const { pipeline } = await setup(t, [...VOCABULARY, thLamp]);
  await pipeline.stage({ kind: 'vocabulary', document: enWord('ki-en-lamp', 'lamp', 'c:lamp') });
  await pipeline.publish();
  await stageImage(pipeline, { id: 'concept-lamp', vocabId: 'ki-en-lamp', concept: 'c:lamp' });
  await stageImage(pipeline, { id: 'concept-lamp-th', vocabId: 'ki-th-lamp', concept: 'c:lamp', language: 'th' });
  await pipeline.publish();
  assert.deepEqual(await pipeline.clearGenerated({ kind: 'images', languages: ['en'], includeBase: true, preview: true }), { katalog: 0, stage: 0, assets: 0 });
  assert.equal((await pipeline.clearGenerated({ kind: 'images', languages: ['th'], includeBase: true, preview: true })).katalog, 1, 'nur die Thai-Ausnahme');
  assert.equal((await pipeline.clearGenerated({ kind: 'images', languages: ['en', 'th'], includeBase: true, preview: true })).katalog, 2);
});

const passed = { status: 'passed', label: 'automatisch geprüft', checkedAt: 't', scope: 'schema-integrity-decode' };
const vocab = (id, language, concept) => ({ kind: 'vocabulary', id, digest: 'd', check: passed, document: { id, language, term: id, concept } });
const image = (id, document) => ({ kind: 'images', id, digest: 'd', asset: `${id}.png`, check: passed, document: { id, ...document } });
const CATALOG = {
  version: 2,
  entries: [
    vocab('ki-th-apple', 'th', 'c:apple'),
    vocab('ki-es-manzana', 'es', 'c:apple'),
    vocab('ki-en-apple', 'en', 'c:apple'),
    vocab('ki-de-haus', 'de', 'ki-de-haus'),
    image('concept-apple', { vocabId: 'ki-th-apple', concept: 'c:apple' }),
    image('concept-apple-es', { vocabId: 'ki-es-manzana', concept: 'c:apple', language: 'es' }),
    image('ki-de-haus', { vocabId: 'ki-de-haus' }),
  ],
};

test('Sprachpakete: ein gemeinsames Bild liegt in jedem Paket, das es braucht; die Ausnahme verdrängt es', () => {
  const languages = new Map(CATALOG.entries.filter((entry) => entry.kind === 'vocabulary').map((entry) => [entry.id, entry.document.language]));
  const ids = (language) => selectPackEntries(CATALOG, language, languages, () => true).images.map((entry) => entry.id);
  assert.deepEqual(ids('th'), ['concept-apple']);
  assert.deepEqual(ids('en'), ['concept-apple']);
  assert.deepEqual(ids('es'), ['concept-apple-es']);
  assert.deepEqual(ids('de'), ['ki-de-haus']);
});

test('Katalog je Lernsprache: das gemeinsame Bild steht in jeder Sprache mit diesem Begriff', () => {
  const rules = { languages: ['th', 'en', 'es', 'de'], uiLanguages: ['de'], isDeliverableEntry: () => true, planDeliveryAudio: () => [] };
  const { files } = splitCatalog(CATALOG, rules, 'abc');
  const images = (language) => files[language].entries.filter((entry) => entry.kind === 'images').map((entry) => entry.id);
  assert.deepEqual(images('th'), ['concept-apple']);
  assert.deepEqual(images('en'), ['concept-apple']);
  assert.deepEqual(images('es'), ['concept-apple', 'concept-apple-es']);
  assert.deepEqual(images('de'), ['ki-de-haus']);
});
