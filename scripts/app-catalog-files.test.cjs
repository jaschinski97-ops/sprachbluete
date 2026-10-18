const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const files = require('./app-catalog-files.cjs');
const { slimEntry } = require('./metro-app-catalog.cjs');

const passed = { status: 'passed', label: 'automatisch geprüft', checkedAt: 'x', scope: 'schema-integrity-decode' };
const word = (id, language, extra = {}) => ({
  kind: 'vocabulary', id, digest: 'd', check: { ...passed, status: 'unchecked' },
  document: { id, language, term: id, german: `bedeutung-${id}`, translations: { en: id }, ...extra },
});
const clip = (id, language) => ({
  kind: 'audio', id, digest: 'd', asset: `${id}.mp3`, check: { ...passed, tone: { status: 'not-applicable', reason: 'x' } },
  document: { id, language, text: id, blobKey: `${id}.mp3`, provider: 'p' },
});
const CATALOG = {
  version: 2,
  vocabularySource: 'generated',
  deleted: { 'audio:th-alt': 5 },
  clearedBefore: { images: 3 },
  entries: [
    word('ki-th-1', 'th'),
    word('ki-th-2', 'th'),
    { ...word('ki-th-kaputt', 'th'), check: { ...passed, status: 'failed' } },
    word('ki-es-1', 'es'),
    word('ki-de-1', 'de'),
    { kind: 'situations', id: 's-th', digest: 'd', check: passed, document: { id: 's-th', direction: 'de_to_th', title: 'Markt' } },
    { kind: 'situations', id: 's-de', digest: 'd', check: passed, document: { id: 's-de', direction: 'th_to_de', title: 'Markt' } },
    { kind: 'images', id: 'ki-th-1', digest: 'd', asset: 'b.webp', check: passed, document: { id: 'ki-th-1', vocabId: 'ki-th-1', prompt: 'lang' } },
    { kind: 'images', id: 'waise', digest: 'd', asset: 'w.webp', check: passed, document: { id: 'waise', vocabId: 'gibt-es-nicht' } },
    clip('th-a', 'th'),
    clip('de-bedeutung', 'de'),
    clip('de-sonst', 'de'),
    clip('en-a', 'en'),
    { kind: 'zukunft', id: 'z', digest: 'd', document: { id: 'z' } },
  ],
};

// Die Regeln der App, hier als kleine Attrappe: Der Plan nennt für Thai den
// de-Clip der deutschen Bedeutung, sonst nichts Fremdes.
const RULES = {
  languages: ['th', 'en', 'es', 'de'],
  isDeliverableEntry: (entry) => entry.check?.status === 'passed' || (entry.kind === 'vocabulary' && entry.check?.status === 'unchecked'),
  planDeliveryAudio: (situations, language, words) => (language === 'th' && words.length ? [{ id: 'de-bedeutung' }, { id: 'th-a' }, { id: 'de-fehlt' }] : []),
};

const ids = (file) => file.entries.map((entry) => `${entry.kind}:${entry.id}`);

test('Aufteilung nach Lernsprache, mit geplanten Bedeutungs-Clips und Unzuordenbarem überall', () => {
  const { files: parts, index } = files.splitCatalog(CATALOG, RULES, 'abc');
  assert.deepEqual(ids(parts.th), [
    'vocabulary:ki-th-1', 'vocabulary:ki-th-2', 'vocabulary:ki-th-kaputt', 'situations:s-th', 'images:ki-th-1', 'audio:th-a',
    'audio:de-bedeutung', 'images:waise', 'zukunft:z',
  ]);
  assert.deepEqual(ids(parts.de), ['vocabulary:ki-de-1', 'situations:s-de', 'audio:de-bedeutung', 'audio:de-sonst', 'images:waise', 'zukunft:z']);
  assert.deepEqual(ids(parts.en), ['audio:en-a', 'images:waise', 'zukunft:z']);
  assert.deepEqual(parts.th.entries[0], slimEntry(CATALOG.entries[0]));
  assert.equal(parts.th.language, 'th');
  assert.equal(parts.th.sourceCatalogSha256, 'abc');
  assert.equal(parts.th.format, files.FORMAT);

  assert.deepEqual(index.entries, []);
  assert.deepEqual(index.deleted, CATALOG.deleted);
  assert.deepEqual(index.clearedBefore, CATALOG.clearedBefore);
  assert.equal(index.vocabularySource, 'generated');
  // Nur auslieferbarer Wortschatz zählt.
  assert.deepEqual(index.appIndex.languages.th.vocabulary, ['ki-th-1', 'ki-th-2']);
  assert.deepEqual(index.appIndex.languages.es.vocabulary, ['ki-es-1']);
  assert.deepEqual(index.appIndex.languages.en.vocabulary, []);
  assert.equal(index.appIndex.sourceCatalogSha256, 'abc');
});

test('Jeder Eintrag landet in mindestens einer Sprachdatei', () => {
  const { files: parts } = files.splitCatalog(CATALOG, RULES, 'abc');
  const all = new Set(Object.values(parts).flatMap(ids));
  assert.deepEqual([...all].sort(), CATALOG.entries.map((entry) => `${entry.kind}:${entry.id}`).sort());
});

function tempRoot(catalog = CATALOG) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-catalog-'));
  fs.mkdirSync(path.join(root, 'src/content'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/catalog.json'), JSON.stringify(catalog));
  return root;
}

test('Stempel: schreibt einmal, überspringt danach, schreibt nach Änderung neu', () => {
  const root = tempRoot();
  const log = () => {};
  const first = files.writeCatalogFiles({ root, rules: RULES, log });
  assert.equal(first.written, true);
  for (const language of RULES.languages) assert.ok(fs.existsSync(path.join(root, files.OUT_DIR, files.fileName(language))));
  assert.equal(files.writeCatalogFiles({ root, rules: RULES, log }).written, false);

  // Eine fehlende Datei macht den Stempel ungültig.
  fs.unlinkSync(path.join(root, files.OUT_DIR, 'es.catalog'));
  assert.equal(files.writeCatalogFiles({ root, rules: RULES, log }).written, true);

  fs.writeFileSync(path.join(root, 'src/content/catalog.json'), JSON.stringify({ ...CATALOG, entries: CATALOG.entries.slice(1) }));
  const third = files.writeCatalogFiles({ root, rules: RULES, log });
  assert.equal(third.written, true);
  assert.notEqual(third.sourceCatalogSha256, first.sourceCatalogSha256);
  const th = JSON.parse(fs.readFileSync(path.join(root, files.OUT_DIR, 'th.catalog'), 'utf8'));
  assert.equal(th.sourceCatalogSha256, third.sourceCatalogSha256);
});

test('Der Transformer bekommt den Index nur zu genau dem Katalog des Stempels', () => {
  const root = tempRoot();
  files.writeCatalogFiles({ root, rules: RULES, log: () => {} });
  const bytes = fs.readFileSync(path.join(root, 'src/content/catalog.json'));
  const index = JSON.parse(files.appCatalogIndex(root, bytes).toString('utf8'));
  assert.deepEqual(index.entries, []);
  assert.equal(index.appIndex.languages.th.vocabulary.length, 2);
  assert.throws(() => files.appCatalogIndex(root, Buffer.concat([bytes, Buffer.from(' ')])), /passen nicht zu src\/content\/catalog\.json/);
  assert.throws(() => files.appCatalogIndex(tempRoot(), bytes), /Stempel fehlt/);
});

test('src/content/catalog-files.ts entspricht dem Erzeuger', () => {
  const expected = files.renderFileMap(files.domainRules().languages);
  const actual = fs.readFileSync(path.join(__dirname, '..', files.MAP_FILE), 'utf8');
  assert.equal(actual, expected, 'node scripts/app-catalog-files.cjs --write-map ausführen');
});
