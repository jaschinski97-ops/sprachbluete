const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CACHE_KEY, isAppCatalogFile, slimCatalog, wrapTransform } = require('./metro-app-catalog.cjs');

const CATALOG = {
  version: 2,
  vocabularySource: 'generated',
  deleted: { 'audio:th-old': 5 },
  clearedBefore: { images: 3 },
  entries: [
    {
      kind: 'audio', id: 'th-1', digest: 'd', asset: 'a.mp3', byteSize: 9, sourceBytes: 18,
      document: { id: 'th-1', language: 'th', text: 'ไม่', kind: 'vocab', sourceId: 'w', format: 'mp3', byteSize: 9, blobKey: 'a.mp3', provider: 'p', model: 'm', voice: 'v', generatedAt: 1, synthetic: true },
      check: { status: 'passed', label: 'automatisch geprüft', checkedAt: 'x', scope: 'schema-integrity-decode', tone: { status: 'passed', version: 'f0', targetTones: ['falling'], reason: 'lang' } },
    },
    {
      kind: 'images', id: 'w', digest: 'd', asset: 'w.webp', byteSize: 1, sourceBytes: 1,
      document: { id: 'w', vocabId: 'w', format: 'webp', byteSize: 1, blobKey: 'w.webp', prompt: 'lang', model: 'm', generatedAt: 1 },
      check: { status: 'passed', label: 'Motiv redaktionell geprüft', checkedAt: 'x', scope: 'schema-integrity-decode-motif-review' },
    },
    {
      kind: 'vocabulary', id: 'w', digest: 'd',
      document: { id: 'w', term: 'ไม่', verificationNote: 'KI-…', translations: { en: 'no' }, generatedAt: 1 },
      check: { status: 'unchecked', label: 'ungeprüft', checkedAt: 'x', scope: 'schema-language', reason: 'KI-Kreuzprüfung' },
    },
    { kind: 'situations', id: 's', digest: 'd', document: { id: 's', title: 'Markt', modelUsed: 'm' } },
    { kind: 'zukunft', id: 'z', digest: 'd', document: { id: 'z', alles: 'bleibt' }, check: { status: 'failed' } },
  ],
};

test('Die App-Fassung behält Inhalt und Auslieferungsdaten, nicht die Studio-Felder', () => {
  const slim = slimCatalog(CATALOG);
  assert.deepEqual(slim.entries, [
    { kind: 'audio', id: 'th-1', document: { id: 'th-1', language: 'th' }, asset: 'a.mp3', check: { status: 'passed', tone: { status: 'passed' } } },
    { kind: 'images', id: 'w', document: { id: 'w', vocabId: 'w' }, asset: 'w.webp', check: { status: 'passed' } },
    { kind: 'vocabulary', id: 'w', document: CATALOG.entries[2].document, check: { status: 'unchecked' } },
    { kind: 'situations', id: 's', document: CATALOG.entries[3].document },
    { kind: 'zukunft', id: 'z', document: CATALOG.entries[4].document, check: { status: 'failed' } },
  ]);
  for (const field of ['version', 'vocabularySource', 'deleted', 'clearedBefore']) assert.deepEqual(slim[field], CATALOG[field]);
  // Der volle Katalog selbst bleibt unberührt.
  assert.equal(CATALOG.entries[0].check.tone.targetTones.length, 1);
  assert.equal(CATALOG.entries[0].digest, 'd');
});

test('Nur der Katalog im Nicht-Entwicklungsbau wird zum Index', async () => {
  const calls = [];
  const asked = [];
  const index = Buffer.from('{"entries":[],"appIndex":{}}');
  const transform = wrapTransform(async (...args) => { calls.push(args); return 'ok'; }, (root, bytes) => { asked.push([root, bytes]); return index; });
  const data = Buffer.from(JSON.stringify(CATALOG, null, 2));
  const file = path.join('src', 'content', 'catalog.json');

  assert.equal(await transform({}, '/root', file, data, { dev: true }), 'ok');
  assert.equal(calls.at(-1)[3], data);
  assert.equal(asked.length, 0);

  await transform({}, '/root', file, data, { dev: false, platform: 'ios' });
  assert.equal(calls.at(-1)[3], index);
  assert.deepEqual(asked, [['/root', data]]);
  assert.deepEqual(calls.at(-1)[4], { dev: false, platform: 'ios' });

  const other = Buffer.from('{"entries":[]}');
  await transform({}, '/root', path.join('src', 'content', 'other.json'), other, { dev: false });
  assert.equal(calls.at(-1)[3], other);
});

test('Pfaderkennung und Cache-Schlüssel', () => {
  assert.ok(isAppCatalogFile('src/content/catalog.json'));
  assert.ok(isAppCatalogFile('/home/x/app/src/content/catalog.json'));
  assert.ok(isAppCatalogFile('C:\\app\\src\\content\\catalog.json'));
  assert.ok(!isAppCatalogFile('src/content/catalog.json.bak'));
  assert.ok(!isAppCatalogFile('src/test-fixtures/catalog.json'));
  assert.match(CACHE_KEY, /^app-catalog-[0-9a-f]{12}$/);
});

test('Metro-Worker hängt den Katalog-Schritt vor Expos Transformer', () => {
  const worker = require('./metro-worker.cjs');
  const upstream = require(require('expo/metro-config').unstable_transformerPath);
  assert.equal(typeof worker.transform, 'function');
  assert.notEqual(worker.transform, upstream.transform);
  assert.equal(worker.getCacheKey, upstream.getCacheKey);
});
