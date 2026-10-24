// Thai-Ton-Engine in den Skripten (24.10.2026): content:integrity und das
// Werkzeug content:thai-tones. Lauf: node --test scripts/content/thai-tones.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ContentPipeline } = require('./pipeline.cjs');
const { checkContent } = require('./check.cjs');
const { main } = require('./thai-tones.cjs');

const situation = {
  id: 'greeting-A1-de_to_th-001', level: 'A1', topic: 'greeting', direction: 'de_to_th',
  title: 'TEST ONLY', setting: 'Pipeline fixture; never publish to the app.',
  scriptTurns: [{ speaker: 'learner', thai: 'สวัสดีครับ', roman: 'sà-wàt-dii khráp', german: 'Hallo' }],
  corrections: [], generatedAt: 1, modelUsed: 'test-fixture',
};
const wort = (extra = {}) => ({
  id: 'fixture-rot', language: 'th', term: 'รถ', german: 'Auto', romanization: 'rót', partOfSpeech: 'noun',
  register: 'neutral', isConcrete: true, syllables: [{ roman: 'rót', tone: 'high' }], sourceVerified: false,
  verificationNote: 'Test', ...extra,
});

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-thai-tones-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, pipeline: new ContentPipeline(root, { extraVocabulary: [] }) };
}

test('content:integrity meldet Ton-Widersprüche in Dialogzeilen, richtige Zeilen bleiben fehlerfrei', async (t) => {
  const { root, pipeline } = await setup(t);
  await pipeline.stage({ kind: 'situations', document: situation });
  await pipeline.publish();
  assert.deepEqual(checkContent(root, { integrityOnly: true }).errors, []);
  const falsch = { ...situation, scriptTurns: [{ ...situation.scriptTurns[0], roman: 'sà-wàt-dii khrâp' }] };
  await pipeline.stage({ kind: 'situations', document: falsch });
  await pipeline.publish();
  const fehler = checkContent(root, { integrityOnly: true }).errors;
  assert.ok(fehler.some((text) => /situations:greeting-A1-de_to_th-001: Ton-Widerspruch: Dialogzeile 1 .*ครับ.*Schrift ergibt hoch, Umschrift fallend/.test(text)), fehler.join('\n'));
});

test('content:integrity prüft Thai-Wörter samt Beispielsatz; Unsicheres wird nur Hinweis', async (t) => {
  const { root, pipeline } = await setup(t);
  await pipeline.stage({ kind: 'vocabulary', document: wort({ exampleTerm: 'รถคันนี้', exampleRoman: 'rót khan níi', exampleGerman: 'dieses Auto' }) });
  await pipeline.stage({ kind: 'vocabulary', document: wort({ id: 'fixture-gitarre', term: 'กีตาร์', german: 'Gitarre', romanization: 'gii-dtâa',
    syllables: [{ roman: 'gii', tone: 'mid' }, { roman: 'dtâa', tone: 'falling' }] }) });
  await pipeline.publish();
  const bericht = checkContent(root, { integrityOnly: true });
  assert.deepEqual(bericht.errors, []);
  assert.ok(bericht.thaiTonHinweise.some((text) => /fixture-gitarre.*Lehnwort/.test(text)));
});

test('Werkzeug: listet Widersprüche mit Soll, Ist, Begründung und Vorschlag; Exit-Code 1', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-thai-tones-cli-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const datei = path.join(dir, 'woerter.json');
  await fs.writeFile(datei, JSON.stringify([
    wort(),
    wort({ id: 'fixture-falsch', term: 'สบาย', romanization: 'sá-baai', syllables: [{ roman: 'sá', tone: 'high' }, { roman: 'baai', tone: 'mid' }] }),
    { language: 'en', term: 'car', romanization: 'kɑː' },
  ]));
  const ausgabe = [];
  const log = console.log;
  console.log = (...teile) => ausgabe.push(teile.join(' '));
  let code;
  try { code = main([datei]); } finally { console.log = log; }
  const text = ausgabe.join('\n');
  assert.equal(code, 1);
  assert.match(text, /WIDERSPRUCH {2}fixture-falsch {2}Wort „สบาย“: Silbe 1 „ส“ \(sá\)/);
  assert.match(text, /Soll \(Schrift\): tief {3}Ist \(Umschrift\): hoch/);
  assert.match(text, /Begründung: ส: hohe Klasse \(implizites a\), tote Silbe, kurzer Vokal → tief/);
  assert.match(text, /Vorschlag: sà-baai/);
  assert.match(text, /2 Einträge geprüft: 1 Widersprüche in 1 Einträgen/);
  assert.doesNotMatch(text, /fixture-rot/);
});

test('Werkzeug: richtige Satzpaare ergeben Exit-Code 0', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thaispeaker-thai-tones-cli-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const datei = path.join(dir, 'saetze.json');
  await fs.writeFile(datei, JSON.stringify([{ thai: 'ผมชอบกินข้าว', roman: 'phǒm chɔ̂ɔp gin khâao' }, situation]));
  const log = console.log;
  console.log = () => {};
  try { assert.equal(main([datei, '--json']), 0); } finally { console.log = log; }
});
