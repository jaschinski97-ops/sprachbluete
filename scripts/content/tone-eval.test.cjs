// Negativproben des Ton-Gate-Bewertungswerkzeugs (tone-eval.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const { falscheFolgen, kategorie, signalKategorie, sollFuerKorpusClip } = require('./tone-eval.cjs');

test('falsche Soll-Folgen unterscheiden sich immer vom echten Soll und sind deterministisch', () => {
  const soll = ['mid', 'falling', 'high'];
  const proben = falscheFolgen(soll, 'clip-1');
  assert.ok(proben.length >= 4);
  for (const probe of proben) assert.notDeepEqual(probe.folge, soll);
  assert.deepEqual(falscheFolgen(soll, 'clip-1'), proben);
  assert.deepEqual(proben.find((p) => p.art === 'gegenlaeufig').folge, ['mid', 'rising', 'low']);
  assert.deepEqual(proben.find((p) => p.art === 'verschoben').folge, ['falling', 'high', 'mid']);
  const eine = proben.find((p) => p.art === 'eine-silbe').folge;
  assert.equal(eine.filter((ton, i) => ton !== soll[i]).length, 1);
});

test('Kategorie: Kontur, sobald eine fallende/steigende Silbe betroffen ist', () => {
  assert.equal(kategorie(['mid', 'low'], ['low', 'mid']), 'register');
  assert.equal(kategorie(['mid', 'low'], ['falling', 'low']), 'kontur');
  assert.equal(kategorie(['rising'], ['falling']), 'kontur');
});

test('Signalproben gelten nur, wo sie den Ton wirklich verändern', () => {
  assert.equal(signalKategorie('eingeebnet', ['mid', 'mid']), null);
  assert.equal(signalKategorie('eingeebnet', ['mid', 'falling']), 'kontur');
  assert.equal(signalKategorie('umgedreht', ['low']), null);
  assert.equal(signalKategorie('umgedreht', ['high']), 'register');
  assert.equal(signalKategorie('umgedreht', ['low', 'high']), 'register');
});

test('Soll-Töne eines Korpus-Clips aus Wortsilben, Beispiel- und Dialog-Umschrift', () => {
  const roman = (text) => text.split(/[-\s]+/).filter(Boolean).map((t) => (/[̂]/.test(t.normalize('NFD')) ? 'falling' : 'mid'));
  assert.deepEqual(sollFuerKorpusClip({ kind: 'vocab', word: { syllables: [{ tone: 'high' }, { tone: 'mid' }] } }, roman), ['high', 'mid']);
  assert.equal(sollFuerKorpusClip({ kind: 'vocab', word: { syllables: [{ tone: 'hoch' }] } }, roman), null);
  assert.deepEqual(sollFuerKorpusClip({ kind: 'example', word: { exampleRoman: 'khâo naa' } }, roman), ['falling', 'mid']);
  assert.deepEqual(sollFuerKorpusClip({ kind: 'turn', situation: { roman: 'khâo, naa?' } }, roman), ['falling', 'mid']);
});

test('Vergleich zählt nur gemeinsame Clips und Proben', () => {
  const { vergleich } = require('./tone-eval.cjs');
  const clip = (status, probe) => ({ id: 'a', soll: ['falling'], alt: 'passed', echt: { status }, proben: [{ art: 'gegenlaeufig', kat: 'kontur', status: probe }] });
  const text = vergleich({ name: 'alt', ergebnisse: [clip('passed', 'passed')] }, { name: 'neu', ergebnisse: [clip('passed', 'unchecked'), { id: 'b', soll: ['mid'], echt: { status: 'passed' }, proben: [] }] });
  assert.match(text, /1 gemeinsame Clips/);
  assert.match(text, /FALSCHE Freigabe: Kontur-Negativproben \| 1 \| 100,0 % \| 0,0 %/);
});
