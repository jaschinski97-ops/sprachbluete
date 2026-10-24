// Tests für den Live-Prüfbericht der Content-Pipeline (Phase 2, Schritt 1).
// Lauf: node --test scripts/content/pipeline-report.test.cjs
//
// Der Kern des Fixes: state() leitet den Bericht aus Stage ∪ Katalog AB —
// vorher wurde pipeline/reports/automatic-checks.json durchgereicht, die nur
// bei publish() geschrieben wird. Nach den Grundstock-Kürzungen listete der
// Bericht deshalb 3.085 längst gelöschte Einträge. Diese Tests pinnen:
//   1. Der Bericht enthält genau die Vereinigung (Stage gewinnt je Schlüssel).
//   2. Löschen aus dem KATALOG aktualisiert den Bericht (und den Stage-Zwilling).
//   3. Löschen aus dem STAGE entfernt den Entwurf.
//   4. Ein Eintrag ohne Check zählt ehrlich als ungeprüft.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ContentPipeline, keyOf } = require('./pipeline.cjs');

test('generated vocabulary can be staged, published, deleted and regenerated without returning the legacy foundation', async () => {
  const root = await tempRoot();
  await fs.writeFile(path.join(root, 'src/content/catalog.json'), JSON.stringify({ version: 2, vocabularySource: 'generated', entries: [] }));
  const pipeline = new ContentPipeline(root);
  const word = { id: 'ki-en-test', language: 'en', term: 'hello', german: 'hallo', romanization: 'həˈləʊ', ipa: 'həˈləʊ',
    partOfSpeech: 'interjection', register: 'neutral', isConcrete: false, syllables: [], sourceVerified: false,
    verificationNote: 'KI-Erzeugung', translations: { de: 'hallo', th: 'สวัสดี' }, generatedAt: Date.now(),
    // Neue KI-Wörter tragen seit 24.10.2026 einen gemeinsamen Begriff (ohne Beispiel keine Satzübersetzungen).
    concept: 'c:hello' };
  await pipeline.stage({ kind: 'vocabulary', document: word });
  await pipeline.publish();
  assert.equal((await pipeline.catalog()).vocabularySource, 'generated');
  assert.equal((await pipeline.catalog()).entries.length, 1);
  await pipeline.clearGenerated({ kind: 'vocabulary', languages: ['en'], includeBase: true });
  await assert.rejects(pipeline.stage({ kind: 'vocabulary', document: word }), /gelöscht/);
  await pipeline.stage({ kind: 'vocabulary', document: { ...word, generatedAt: Date.now() + 10 } });
  await pipeline.publish();
  assert.equal((await pipeline.catalog()).entries.length, 1);
});

test('Löschen nach Art und Zielsprache entfernt auch alte Grundstock- und Stage-Einträge', async () => {
  const root = await tempRoot();
  const th = eintrag('situations', 'alt-th', { document: { direction: 'de_to_th', generatedAt: 1 } });
  const de = eintrag('situations', 'alt-de', { document: { direction: 'th_to_de', generatedAt: 1 } });
  const audio = eintrag('audio', 'clip', { document: { language: 'th', generatedAt: 1 } });
  await fs.writeFile(path.join(root, 'src/content/catalog.json'), JSON.stringify({ version: 2, entries: [th,de,audio] }));
  await fs.writeFile(path.join(root, '.content-studio/stage.json'), JSON.stringify({ version: 2, entries: [th,de] }));
  const pipeline = new ContentPipeline(root);
  const scope = { kind: 'situations', languages: ['th'], includeBase: true };
  assert.equal((await pipeline.clearGenerated({ ...scope, preview: true })).katalog, 1);
  assert.equal((await pipeline.catalog()).entries.length, 3);
  assert.equal((await pipeline.clearGenerated(scope)).stage, 1);
  const state = await pipeline.state();
  assert.deepEqual(state.shipped.entries.map(keyOf), ['situations:alt-de', 'audio:clip']);
  assert.deepEqual(state.stage.entries.map(keyOf), ['situations:alt-de']);
  assert.ok(state.shipped.deleted['situations:alt-th'] > 1);
  assert.equal((await pipeline.clearGenerated(scope)).katalog, 0);
  await assert.rejects(pipeline.clearGenerated({ kind: 'unknown' }), /Löschart/);
  await assert.rejects(pipeline.clearGenerated({ languages: [] }), /Sprachauswahl/);
});

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-report-'));
  await fs.mkdir(path.join(root, 'src', 'content'), { recursive: true });
  await fs.mkdir(path.join(root, '.content-studio'), { recursive: true });
  return root;
}

// Minimale, vertragslose Fixtures: state()/deriveReport()/delete* lesen nur
// JSON — assertDocument wird hier bewusst NICHT durchlaufen (der Test prüft
// die Berichts-Ableitung, nicht den Inhaltsvertrag).
const eintrag = (kind, id, extra = {}) => ({
  kind,
  id,
  document: { id, text: `Text von ${id}`, ...(extra.document ?? {}) },
  digest: `digest-${kind}-${id}`,
  check: { status: 'passed', label: 'automatisch geprüft', scope: 'schema-integrity-decode', ...(extra.check ?? {}) },
  ...(extra.asset ? { asset: extra.asset } : {}),
});

async function schreibeFixtures(root) {
  const shipped = {
    version: 2,
    entries: [
      eintrag('audio', 'a-geprueft'),
      eintrag('audio', 'a-ungeprueft', { check: { status: 'unchecked', label: 'ungeprüft', scope: 'schema-integrity-decode' } }),
      eintrag('situations', 's-nur-katalog'),
    ],
  };
  const stage = {
    version: 2,
    entries: [
      // Überschreibt den Katalog-Stand (jünger) — hier: failed statt passed.
      eintrag('audio', 'a-ungeprueft', { check: { status: 'failed', label: 'aussortiert', scope: 'schema-integrity-decode' } }),
      eintrag('audio', 'a-nur-stage', { check: { status: 'failed', label: 'aussortiert', scope: 'schema-integrity-decode' } }),
    ],
  };
  await fs.writeFile(path.join(root, 'src/content/catalog.json'), JSON.stringify(shipped));
  await fs.writeFile(path.join(root, '.content-studio/stage.json'), JSON.stringify(stage));
  return { shipped, stage };
}

test('Bericht ist die deduplizierte Vereinigung aus Katalog und Stage (Stage gewinnt)', async () => {
  const root = await tempRoot();
  await schreibeFixtures(root);
  const pipeline = new ContentPipeline(root);
  const { report } = await pipeline.state();

  const keys = report.entries.map((entry) => keyOf(entry)).sort();
  assert.deepEqual(keys, [
    'audio:a-geprueft',
    'audio:a-nur-stage',
    'audio:a-ungeprueft',
    'situations:s-nur-katalog',
  ]);
  // Stage gewinnt: der Stage-Stand (failed) vertritt den Eintrag.
  const zweideutig = report.entries.find((entry) => entry.id === 'a-ungeprueft');
  assert.equal(zweideutig.status, 'failed');
  assert.equal(report.entries.filter((entry) => entry.status === 'failed').length, 2);
  assert.equal(report.entries.filter((entry) => entry.status === 'unchecked').length, 0);
});

test('Löschen aus dem KATALOG aktualisiert den Bericht und nimmt den Stage-Zwilling mit', async () => {
  const root = await tempRoot();
  await schreibeFixtures(root);
  const pipeline = new ContentPipeline(root);

  const entfernt = await pipeline.deleteFromCatalog('audio', 'a-ungeprueft');
  assert.notEqual(entfernt, null);

  const { report, stage } = await pipeline.state();
  const keys = report.entries.map((entry) => keyOf(entry));
  assert.ok(!keys.includes('audio:a-ungeprueft'), 'gelöschter Eintrag fehlt im Bericht');
  // Kein Auferstehungs-Zwilling im Stage (publish() merged nur hinzu).
  assert.ok(!stage.entries.some((entry) => keyOf(entry) === 'audio:a-ungeprueft'));
  assert.equal(report.entries.length, 3);
});

test('Löschen aus dem STAGE entfernt nur den Entwurf, der Katalog bleibt', async () => {
  const root = await tempRoot();
  await schreibeFixtures(root);
  const pipeline = new ContentPipeline(root);

  assert.notEqual(await pipeline.deleteFromStage('audio', 'a-nur-stage'), null);
  const { report, shipped } = await pipeline.state();
  assert.ok(!report.entries.some((entry) => entry.id === 'a-nur-stage'));
  assert.equal(shipped.entries.length, 3);
  // Zweiter Versuch: nichts mehr zu holen.
  assert.equal(await pipeline.deleteFromStage('audio', 'a-nur-stage'), null);
});

test('Ein Eintrag ohne Prüfungsinformation zählt ehrlich als ungeprüft', async () => {
  const root = await tempRoot();
  const ohneCheck = { version: 2, entries: [{ kind: 'exam', id: 'e-ohne-check', document: { id: 'e-ohne-check', title: 'Eine Aufgabe' } }] };
  await fs.writeFile(path.join(root, 'src/content/catalog.json'), JSON.stringify(ohneCheck));
  await fs.writeFile(path.join(root, '.content-studio/stage.json'), JSON.stringify({ version: 2, entries: [] }));
  const pipeline = new ContentPipeline(root);
  const { report } = await pipeline.state();
  assert.equal(report.entries[0].status, 'unchecked');
  assert.match(report.entries[0].reason, /Keine Prüfungsinformation/);
});

test('Lösch-Endpunkte weisen unschlüssige Schlüssel ab', async () => {
  const root = await tempRoot();
  await schreibeFixtures(root);
  const pipeline = new ContentPipeline(root);
  await assert.rejects(() => pipeline.deleteFromCatalog('../escape', 'x'), /Ungültige/);
  await assert.rejects(() => pipeline.deleteFromStage('waffen', 'x'), /Ungültige/);
});
