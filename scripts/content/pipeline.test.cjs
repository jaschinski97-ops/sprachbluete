const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ContentPipeline, BUDGET, shippingBytes } = require('./pipeline.cjs');
const { createStudio } = require('./studio.cjs');
const { AutomaticDelivery } = require('./automatic-delivery.cjs');
const { checkContent } = require('./check.cjs');
const { pruneOrphans } = require('./prune-orphans.cjs');
const domain = require('./domain.cjs');
const { Readable } = require('node:stream');
const { clipIdFor } = domain.load('src/lib/clips/types');
// Feste Fixture-Wörter (früherer Grundstock, nur noch Testdaten).
const { VOCABULARY } = domain.load('src/test-fixtures/legacy-vocabulary');
test('scoped vocabulary publish preserves unrelated staged drafts and budget', async t => {
  const { root, pipeline } = await setup(t);
  const words = ['first', 'second'].map((term, index) => ({
    id: 'scope-' + index, language: 'en', term, german: term, romanization: term,
    partOfSpeech: 'adjective', register: 'neutral', isConcrete: false,
    syllables: [], sourceVerified: false, verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
  }));
  await pipeline.stage({ kind: 'vocabulary', document: words[0] });
  await pipeline.stage({ kind: 'vocabulary', document: words[1] });
  const before = await pipeline.state();
  await pipeline.publish({ vocabularyIds: [words[0].id] });
  const after = await pipeline.state();
  assert.deepEqual(after.shipped.entries.map(e => e.id), [words[0].id]);
  assert.deepEqual(after.stage.entries.find(e => e.id === words[1].id),
    before.stage.entries.find(e => e.id === words[1].id));
  await assert.rejects(pipeline.publish({ vocabularyIds: ['missing'] }), /Nicht alle/);
  assert.ok(root);
});
const { analyzeToneContour } = domain.load('src/lib/speaking/analysis');
test('scoped image publish leaves unrelated vocabulary draft untouched', async t => {
  const { pipeline } = await setup(t);
  const word = VOCABULARY.find(item => item.isConcrete);
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  await pipeline.stage({ kind: 'images', document: { id: word.id, vocabId: word.id, format: 'png', byteSize: bytes.length,
    blobKey: word.id + '.png', prompt: 'TEST, no text', model: 'TEST', generatedAt: 1 }, base64: bytes.toString('base64') });
  await pipeline.stage({ kind: 'vocabulary', document: { id: 'unrelated', language: 'en', term: 'precise', german: 'genau',
    romanization: 'precise', partOfSpeech: 'adjective', register: 'neutral', isConcrete: false, syllables: [],
    learningStage: 'pro', sourceVerified: false, verificationNote: 'KI-Test' } });
  const before = await pipeline.state();
  await pipeline.publish({ imageIds: [word.id] });
  const after = await pipeline.state();
  assert.deepEqual(after.shipped.entries.map(entry => entry.kind), ['images']);
  assert.deepEqual(after.stage.entries.find(entry => entry.id === 'unrelated'), before.stage.entries.find(entry => entry.id === 'unrelated'));
  await assert.rejects(pipeline.publish({ imageIds: ['missing'] }), /Nicht alle/);
  await assert.rejects(pipeline.publish({ imageIds: null }), /nichtleere/);
  await assert.rejects(pipeline.publish({ imageIds: [word.id], vocabularyIds: ['unrelated'] }), /Nur eine/);
});
const { decodeAudio } = require('./media.cjs');
const situation = {
  id: 'greeting-A1-de_to_th-001', level: 'A1', topic: 'greeting', direction: 'de_to_th',
  title: 'TEST ONLY', setting: 'Pipeline fixture; never publish to the app.',
  scriptTurns: [{ speaker: 'learner', thai: 'สวัสดี', roman: 'sà-wàt-dii', german: 'Hallo' }],
  corrections: [], generatedAt: 1, modelUsed: 'test-fixture',
};
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-content-test-'));
  assert.equal(path.dirname(root), os.tmpdir());
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, pipeline: new ContentPipeline(root, { extraVocabulary: VOCABULARY }) };
}
test('automatic delivery exposes each checked image before finalizing build files, preserves unrelated drafts', async t => {
  const { root, pipeline } = await setup(t);
  const word = VOCABULARY.find(item => item.isConcrete);
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  await pipeline.stage({ kind: 'situations', document: situation });
  const before = await pipeline.state();
  const delivery = new AutomaticDelivery(pipeline);
  const { token } = await delivery.begin();
  await assert.rejects(delivery.begin(), /bereits/);
  await assert.rejects(delivery.accept('wrong', {}), /nicht mehr aktiv/);
  const entry = await delivery.accept(token, { kind: 'images', document: { id: word.id, vocabId: word.id,
    format: 'png', byteSize: bytes.length, blobKey: word.id + '.png', prompt: 'TEST no text', model: 'TEST', generatedAt: 1 }, base64: bytes.toString('base64') });
  assert.equal((await pipeline.catalog()).entries.length, 0);
  assert.equal(delivery.catalog().entries[0].id, word.id);
  assert.deepEqual(await fs.readFile(path.join(root, 'public/content', entry.asset)), bytes);
  assert.equal((await delivery.readCheckpoint()).entries.length, 1);
  // Finalizing must not run the expensive checks again on the existing corpus.
  pipeline.checkEntry = () => { throw Error('unexpected repeated check'); };
  assert.deepEqual(await delivery.finish(token), { count: 1 });
  assert.equal((await pipeline.catalog()).entries[0].id, word.id);
  assert.equal(await delivery.readCheckpoint(), null);
  assert.deepEqual((await pipeline.state()).stage.entries.find(e => e.kind === 'situations'), before.stage.entries[0]);
});
test('helper restart recovers acknowledged content and restores missing public media', async t => {
  const { root, pipeline } = await setup(t);
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  const word = VOCABULARY.find(item => item.isConcrete);
  const delivery = new AutomaticDelivery(pipeline);
  const { token } = await delivery.begin();
  const entry = await delivery.accept(token, { kind: 'images', document: { id: word.id, vocabId: word.id,
    format: 'png', byteSize: bytes.length, blobKey: word.id + '.png', prompt: 'TEST no text', model: 'TEST', generatedAt: 1 }, base64: bytes.toString('base64') });
  await fs.unlink(path.join(root, 'public/content', entry.asset));
  const restarted = new AutomaticDelivery(pipeline);
  await restarted.recover();
  assert.equal(restarted.active, null);
  assert.equal((await pipeline.catalog()).entries[0].id, word.id);
  assert.deepEqual(await fs.readFile(path.join(root, 'public/content', entry.asset)), bytes);
  assert.equal(await restarted.readCheckpoint(), null);
});
test('failed checks never become live; external catalog edits retain the recovery checkpoint', async t => {
  const { pipeline } = await setup(t);
  const delivery = new AutomaticDelivery(pipeline);
  const { token } = await delivery.begin();
  const word = VOCABULARY.find(item => item.id === 'kha');
  await assert.rejects(delivery.accept(token, audio(wav(120, 240), word)));
  assert.equal(delivery.catalog().entries.length, 0);
  await delivery.accept(token, { kind: 'situations', document: situation });
  await pipeline.writeCatalog({ version: 2, entries: [], deleted: { unrelated: 1 } });
  await assert.rejects(delivery.finish(token), /extern geändert/);
  assert.equal((await delivery.readCheckpoint()).entries.length, 1);
  await assert.rejects(new AutomaticDelivery(pipeline).recover(), /extern geändert/);
});
test('finish can be retried after catalog write succeeded but checkpoint cleanup failed', async t => {
  const { pipeline } = await setup(t);
  const delivery = new AutomaticDelivery(pipeline);
  const { token } = await delivery.begin();
  await delivery.accept(token, { kind: 'situations', document: situation });
  await pipeline.writeCatalog(delivery.catalog());
  assert.deepEqual(await delivery.finish(token), { count: 1 });
  assert.equal(await delivery.readCheckpoint(), null);
});
test('automatic delivery keeps budget accounting correct for replacements and rejects overflow before exposure', async t => {
  const { pipeline } = await setup(t);
  const delivery = new AutomaticDelivery(pipeline);
  const { token } = await delivery.begin();
  const first = await delivery.accept(token, { kind: 'situations', document: situation });
  assert.equal(delivery.active.budgetBytes, shippingBytes(first));
  const replacement = await delivery.accept(token, { kind: 'situations', document: { ...situation, setting: 'longer setting for replacement' } });
  assert.equal(delivery.active.budgetBytes, shippingBytes(replacement));
  delivery.active.budgetBytes = BUDGET;
  await assert.rejects(delivery.accept(token, { kind: 'situations', document: { ...situation, id: 'greeting-A1-de_to_th-002' } }), /Budget|budget/);
  assert.equal(delivery.catalog().entries.length, 1);
  assert.deepEqual(await delivery.finish(token), { count: 1 });
});
test('delivery HTTP routes are origin-protected, expose live state, and prevent concurrent catalog mutations', async t => {
  const { root } = await setup(t);
  const server = createStudio(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, origin = 'http://localhost:8081') => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/delivery/start', {}, null)).status, 403);
  const { token } = await (await post('/delivery/start', {})).json();
  assert.equal((await post('/delivery/touch', { token })).status, 200);
  assert.equal((await post('/delivery/item', { token, kind: 'situations', document: situation })).status, 200);
  const state = await (await fetch(url + '/state')).json();
  assert.equal(state.shipped.entries[0].id, situation.id);
  assert.equal((await post('/catalog/delete', { kind: 'situations', id: situation.id })).status, 400);
  assert.deepEqual(await (await post('/delivery/finish', { token })).json(), { count: 1 });
  assert.equal((await post('/delivery/touch', { token })).status, 400);
});
test('missing background heartbeat never finalizes during a model request; idle recovery finishes afterwards', async t => {
  const { root, pipeline } = await setup(t);
  const realInterval = global.setInterval;
  let idle;
  let release;
  let started;
  const upstreamStarted = new Promise(resolve => { started = resolve; });
  const upstreamHeld = new Promise(resolve => { release = resolve; });
  global.setInterval = callback => { idle = callback; return { unref() {} }; };
  let server;
  try {
    server = createStudio(root, { getApiKey: () => 'fixture-key', logRun: () => {}, openaiFetch: async () => {
      started(); await upstreamHeld;
      return { ok: true, headers: new Map(), body: Readable.toWeb(Readable.from([Buffer.from('fixture audio')])) };
    } });
  } finally { global.setInterval = realInterval; }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify(body) });
  const { token } = await (await post('/delivery/start', {})).json();
  await post('/delivery/item', { token, kind: 'situations', document: situation });
  const audioResponse = post('/api/openai/tts', { text: 'fixture', voice: 'onyx' });
  await upstreamStarted;
  const realNow = Date.now;
  const future = realNow() + 150000;
  Date.now = () => future;
  try {
    await idle();
    assert.equal((await pipeline.catalog()).entries.length, 0);
    release();
    assert.equal((await audioResponse).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    await idle();
    assert.equal((await pipeline.catalog()).entries[0].id, situation.id);
  } finally { Date.now = realNow; release(); await audioResponse; }
});
function wav(start = 200, end = start) {
  const data = Buffer.alloc(44 + 24000 * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  let phase = 0;
  for (let i = 0; i < 24000; i++) {
    phase += 2 * Math.PI * (start + (end - start) * i / 24000) / 24000;
    data.writeInt16LE(Math.round(8000 * Math.sin(phase)), 44 + i * 2);
  }
  return data;
}
function audio(bytes, word, language = 'th') {
  const text = word?.term ?? 'test'; const id = clipIdFor(language, text);
  return { kind: 'audio', document: { id, language, text, kind: 'vocab', sourceId: word?.id ?? 'fixture',
    format: 'wav', byteSize: bytes.length, blobKey: id + '.wav', provider: 'gemini', model: 'TEST SINE, NOT SPEECH',
    voice: 'test', generatedAt: 1, synthetic: true }, base64: bytes.toString('base64') };
}
test('automatic publication, schema, re-export and metadata tampering with no review method', async (t) => {
  const { root, pipeline } = await setup(t);
  assert.equal(pipeline.review, undefined);
  const entry = await pipeline.stage({ kind: 'situations', document: situation });
  assert.equal(entry.check.status, 'passed');
  assert.equal((await pipeline.publish()).entries, 1);
  await pipeline.stage({ kind: 'situations', document: { ...situation, setting: 'changed' } });
  await pipeline.publish(); assert.equal((await pipeline.catalog()).entries[0].document.setting, 'changed');
  const state = await pipeline.state(); state.stage.entries[0].document.setting = 'tampered';
  await fs.writeFile(pipeline.stageFile, JSON.stringify(state.stage));
  await assert.rejects(pipeline.publish(), /Prüfsumme/);
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);
  assert.ok(checkContent(root, { extraVocabulary: VOCABULARY }).errors.some(error => error.includes('Hörclips')));
  await assert.rejects(pipeline.stage({ kind: 'situations', document: { ...situation, apiKey: 'never-export' } }), /Metadaten/);
});
test('failed tones stay out; unchecked clips ship with their original status and are counted', async (t) => {
  const { root, pipeline } = await setup(t);
  const word = VOCABULARY.find(word => word.id === 'kha');
  const wrong = await pipeline.stage(audio(wav(120, 240), word));
  assert.equal(wrong.check.tone.status, 'failed'); assert.equal((await pipeline.publish()).entries, 0);
  const right = await pipeline.stage(audio(wav(240, 120), word));
  assert.equal(right.check.tone.status, 'passed'); assert.equal((await pipeline.publish()).entries, 1);
  const multi = VOCABULARY.find(word => word.id === 'sawatdii');
  assert.equal((await pipeline.stage(audio(wav(), multi))).check.status, 'unchecked');
  const report = await pipeline.publish(); assert.equal(report.entries, 2); assert.equal(report.unchecked, 1);
  assert.equal(report.uncheckedThaiDelivered, 1);
  assert.equal(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).uncheckedThaiDelivered, 1);
  assert.equal((await pipeline.catalog()).entries.find(entry => entry.id !== right.id).check.tone.status, 'unchecked');
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);
  await pipeline.stage(audio(wav(120, 240), word)); await pipeline.publish();
  assert.equal((await pipeline.catalog()).entries.length, 1);
  const measurements = JSON.parse(await fs.readFile(pipeline.reportFile));
  assert.equal(measurements.entries.find(entry => entry.id === wrong.id).tone.targetTone, 'falling');
});
test('chatgpt-helper-Clips bestehen den audio-Vertrag (17.09.: 141 Nutzer-Clips verworfen)', async (t) => {
  const { pipeline } = await setup(t);
  const word = VOCABULARY.find(word => word.id === 'sawatdii');
  const vorlage = audio(wav(), word);
  const helperClip = { ...vorlage, document: { ...vorlage.document, provider: 'chatgpt-helper', model: 'gpt-4o-mini-tts-2025-12-15' } };
  assert.equal((await pipeline.stage(helperClip)).check.status, 'unchecked');
  const fremd = { ...vorlage, document: { ...vorlage.document, provider: 'nicht-da' } };
  await assert.rejects(pipeline.stage(fremd), /audio-Vertrag/);
});
test('budget overflow leaves the complete previous catalog unchanged', async (t) => {
  const { pipeline } = await setup(t);
  await pipeline.stage({ kind: 'situations', document: situation }); await pipeline.publish();
  const previous = await fs.readFile(pipeline.catalogFile, 'utf8');
  const state = await pipeline.state(); state.stage.entries[0].byteSize = BUDGET + 1;
  await fs.writeFile(pipeline.stageFile, JSON.stringify(state.stage));
  await assert.rejects(pipeline.publish(), /Kein Teil/);
  assert.equal(await fs.readFile(pipeline.catalogFile, 'utf8'), previous);
});
test('real MP3 encode/decode, content hash, static assets and corrupt-media repair', async (t) => {
  const { root, pipeline } = await setup(t); const input = audio(wav(), undefined, 'en');
  await assert.rejects(pipeline.stage({ ...input, base64: 'AAAA' }), /Bytezahl/);
  const entry = await pipeline.stage(input); assert.ok(entry.byteSize < input.document.byteSize / 3);
  const staged = path.join(pipeline.work, entry.asset); const encoded = await fs.readFile(staged);
  for (const damage of ['missing', 'corrupt']) {
    if (damage === 'missing') await fs.rm(staged); else await fs.writeFile(staged, 'corrupt');
    await pipeline.stage(input); assert.deepEqual(await fs.readFile(staged), encoded);
  }
  await pipeline.publish(); assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);
  assert.match(await fs.readFile(path.join(root, 'src/content/assets.ts'), 'utf8'), /require\('\.\.\/\.\.\/assets\/content\/[a-f0-9]{64}\.mp3'\)/);
  await fs.writeFile(path.join(root, 'assets/content', entry.asset), 'corrupt');
  assert.ok(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors.some(error => error.includes('geändert')));
});
test('images require real decoding and concrete-word schema', async (t) => {
  const { root, pipeline } = await setup(t); const id = VOCABULARY.find(word => word.isConcrete).id;
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  const document = { id, vocabId: id, format: 'png', byteSize: bytes.length, blobKey: id + '.png', prompt: 'TEST', model: 'TEST', generatedAt: 1 };
  await assert.rejects(pipeline.stage({ kind: 'images', document: { ...document, id: '../escape' }, base64: bytes.toString('base64') }), /Ungültige/);
  const entry = await pipeline.stage({ kind: 'images', document, base64: bytes.toString('base64') });
  assert.equal(entry.byteSize, bytes.length); await pipeline.publish();
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);
  const broken = Buffer.from('89504e470d0a1a0a', 'hex');
  await assert.rejects(pipeline.stage({ kind: 'images', document: { ...document, byteSize: broken.length }, base64: broken.toString('base64') }));
});
test('Löschen merkt sich den Eintrag und nimmt die Bilder der Vokabel mit (26.09.)', async (t) => {
  const { root, pipeline } = await setup(t);
  const wort = {
    id: 'ki-en-loeschtest', language: 'en', term: 'lamp', german: 'Lampe', romanization: 'lamp',
    partOfSpeech: 'noun', register: 'neutral', isConcrete: true,
    syllables: [], sourceVerified: false, verificationNote: 'KI-Kreuzprüfung bestanden (Test)',
  };
  await pipeline.stage({ kind: 'vocabulary', document: wort });
  await pipeline.publish();
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  const bild = await pipeline.stage({ kind: 'images', document: { id: wort.id, vocabId: wort.id, format: 'png', byteSize: bytes.length, blobKey: wort.id + '.png', prompt: 'TEST lamp, no text', model: 'TEST', generatedAt: 1 }, base64: bytes.toString('base64') });
  await pipeline.publish();
  assert.equal((await pipeline.catalog()).entries.length, 2);

  await pipeline.deleteFromCatalog('vocabulary', wort.id);
  const katalog = await pipeline.catalog();
  assert.equal(katalog.entries.length, 0, 'das Bild geht mit seiner Vokabel');
  assert.ok(katalog.deleted[`vocabulary:${wort.id}`] && katalog.deleted[`images:${wort.id}`], 'beide stehen in deleted');
  await assert.rejects(fs.readFile(path.join(root, 'assets/content', bild.asset)));
  // Vorher warf der nächste Publish „Inhalt verletzt den images-Vertrag“.
  await pipeline.publish();
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);

  await pipeline.stage({ kind: 'situations', document: situation });
  await pipeline.deleteFromStage('situations', situation.id);
  assert.ok((await pipeline.catalog()).deleted[`situations:${situation.id}`], 'auch Stage-Löschungen stehen in deleted');
});
test('Die Route „alles Generierte löschen“ gibt es nicht mehr', async (t) => {
  const { root } = await setup(t); const server = createStudio(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' };
  assert.equal((await fetch(url + '/catalog/clear-generated', { method: 'POST', headers, body: '{}' })).status, 404);
  assert.equal((await fetch(url + '/catalog/clear-generated')).status, 404);
});
test('reverse consistency: orphan assets and stray require-map keys fail every check mode; prune removes only orphans', async (t) => {
  const { root, pipeline } = await setup(t);
  const id = VOCABULARY.find(word => word.isConcrete).id;
  const bytes = await fs.readFile(path.join(__dirname, '../../assets/images/icon.png'));
  await pipeline.stage({ kind: 'images', document: { id, vocabId: id, format: 'png', byteSize: bytes.length, blobKey: id + '.png', prompt: 'TEST', model: 'TEST', generatedAt: 1 }, base64: bytes.toString('base64') });
  await pipeline.publish();
  assert.deepEqual(checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors, []);
  const orphan = 'b'.repeat(64) + '.mp3';
  const stray = 'a'.repeat(64) + '.png';
  const assetMapFile = path.join(root, 'src/content/assets.ts');
  await fs.writeFile(path.join(root, 'assets/content', orphan), 'orphan');
  await fs.writeFile(path.join(root, 'assets/content', '.DS_Store'), 'junk');
  await fs.writeFile(assetMapFile, (await fs.readFile(assetMapFile, 'utf8'))
    .replace(/\};\s*$/, `  ${JSON.stringify(stray)}: require('../../assets/content/${stray}'),\n};\n`));
  for (const integrityOnly of [true, false]) {
    const errors = checkContent(root, { integrityOnly, extraVocabulary: VOCABULARY }).errors;
    assert.ok(errors.some(error => error.includes(orphan)), 'verwaiste Datei muss in jedem Modus fehlschlagen');
    assert.ok(errors.some(error => error.includes(stray) && error.includes('assets.ts')), 'Schlüssel ohne Katalogreferenz muss fehlschlagen');
  }
  const dryRun = pruneOrphans(root);
  assert.deepEqual(dryRun.orphans.map(orphan => orphan.name), [orphan]);
  assert.deepEqual(dryRun.unknown.map(file => file.name), ['.DS_Store']);
  assert.equal((await fs.readFile(path.join(root, 'assets/content', orphan), 'utf8')), 'orphan');
  const applied = pruneOrphans(root, { apply: true });
  assert.equal(applied.deleted, 1); assert.equal(applied.freedBytes, 6);
  await assert.rejects(fs.readFile(path.join(root, 'assets/content', orphan)));
  assert.equal((await fs.readFile(path.join(root, 'assets/content', '.DS_Store'), 'utf8')), 'junk');
  const errors = checkContent(root, { integrityOnly: true, extraVocabulary: VOCABULARY }).errors;
  assert.ok(!errors.some(error => error.includes(orphan)), 'Datei-Orphan ist entfernt');
  assert.ok(errors.some(error => error.includes(stray)), 'Schlüssel-Orphan bleibt ein Checkfehler, bis assets.ts neu generiert wird');
});
test('loopback API origin protections and removal of the review endpoint', async (t) => {
  const { root } = await setup(t); const server = createStudio(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ kind: 'situations', document: situation });
  for (const origin of [undefined, 'https://attacker.example', 'http://localhost:8083']) {
    assert.equal((await fetch(url + '/stage', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body })).status, 403);
  }
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' };
  assert.equal((await fetch(url + '/review', { method: 'POST', headers, body })).status, 404);
  assert.equal((await fetch(url + '/stage', { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url + '/publish', { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await (await fetch(url + '/state')).json()).shipped.entries.length, 1);
});
test('real short dead syllable: strict threshold loses the fall, continuity recovers it', async () => {
  // Fixture liegt seit dem Orphan-GC (2026-09-07) bewusst unter fixtures/,
  // nicht mehr in assets/content: Dort zählt nur katalogreferenzierter
  // Inhalt, und dieser Clip ist keiner. Der sha256 war der Asset-Name.
  const real = path.join(__dirname, 'fixtures/real-dead-syllable.mp3');
  assert.equal(require('node:crypto').createHash('sha256').update(await fs.readFile(real)).digest('hex'), '16440f54287a4d83aa57d3a98bcefcf9b8512489e88b49c76ad6397e3c94cd89');
  const pcm = decodeAudio(real);
  assert.equal(analyzeToneContour(pcm, 24000, undefined, false).status, 'unmeasurable');
  const corrected = analyzeToneContour(pcm, 24000); assert.equal(corrected.status, 'measured');
  assert.ok(corrected.summary.slope < -4.5 && corrected.summary.slope > -6);
  assert.ok(corrected.summary.durMs >= 100);
});

test('AE-31 reproduction: every previously measurable Microsoft contour remains unchanged', async () => {
  const manifest = require('./fixtures/tones/index.json');
  const { checkThaiTone } = domain.load('src/lib/content/tone-gate');
  for (const item of manifest) {
    const file = path.join(__dirname, 'fixtures/tones', item.file);
    const bytes = await fs.readFile(file);
    assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), item.sha256);
    const pcm = decodeAudio(file);
    const before = analyzeToneContour(pcm, 24000, undefined, false);
    const after = analyzeToneContour(pcm, 24000);
    assert.equal(before.status, 'measured');
    assert.deepEqual(after, before, item.file);
    const word = VOCABULARY.find(word => word.language === 'th' && word.term === item.word);
    const result = checkThaiTone(audio(wav(), word).document, pcm, 24000, { woerter: VOCABULARY });
    assert.equal(result.status, ['falling', 'rising'].includes(item.tone) ? 'passed' : 'unchecked', item.file);
  }
});

test('shippingBytes ignores the diagnostic F0 track: a multi-megabyte track never counts toward the budget', () => {
  // Regression: publish() previously ran the 150-MiB check over entries that
  // still carried check.tone.track, although the delivered catalog strips it.
  // A staged set could then be refused although its shipping size fits.
  const naive = (entry) => (entry.byteSize ?? 0) + Buffer.byteLength(JSON.stringify(entry));
  const entry = { kind: 'situations', id: situation.id, document: { ...situation }, digest: 'unused', byteSize: 1234,
    check: { status: 'passed', label: 'automatisch geprüft' } };
  const withTrack = structuredClone(entry);
  withTrack.check.tone = { status: 'passed', targetTone: 'mid',
    track: Array.from({ length: 250000 }, (_, frame) => ({ frame, hz: 220.5 })) };
  const stripped = structuredClone(withTrack);
  delete stripped.check.tone.track;
  assert.ok(Buffer.byteLength(JSON.stringify(withTrack)) > 5 * 1024 * 1024, 'Fixture-Track muss groß genug sein, um den Fehler sichtbar zu machen');
  assert.equal(shippingBytes(withTrack), naive(stripped), 'nur die versandte Kopie ohne Track zählt');
  assert.ok(naive(withTrack) - shippingBytes(withTrack) > 5 * 1024 * 1024, 'der mehr-Megabyte-Track ist tatsächlich ausgeklammert');
  assert.equal(shippingBytes(entry), naive(entry), 'ohne Track bleibt die naive Größe unverändert');
});
