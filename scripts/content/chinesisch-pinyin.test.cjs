/**
 * Pinyin-Prüfung für chinesische Wörter und Dialoge (07.11.2026,
 * `content-plan/chinesische-woerter.cjs`): gültige Silben, Tonzeichen auf dem
 * richtigen Vokal, Silbenzahl eines Satzes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { silbenProblem, zerlege, satzSilben, wortPinyin } = require('../../content-plan/chinesische-woerter.cjs');

test('erkennt gültige Silben mit Tonzeichen und neutralem Ton', () => {
  for (const silbe of ['mā', 'péng', 'you', 'nǚ', 'lǜ', 'zhuāng', 'guó', 'liù', 'huí', 'nǎr']) {
    assert.equal(silbenProblem(silbe), null, silbe);
  }
});

test('meldet erfundene Silben, doppelte und falsch gesetzte Tonzeichen', () => {
  assert.match(silbenProblem('xx'), /keine Pinyin-Silbe/);
  assert.match(silbenProblem('lv'), /keine Pinyin-Silbe/);
  assert.match(silbenProblem('hǎó'), /mehrere Tonzeichen/);
  assert.match(silbenProblem('hǎo'.replace('ǎ', 'a').replace('o', 'ǒ')), /falschen Vokal/);
  assert.match(silbenProblem('lìu'), /falschen Vokal/);
});

test('zerlegt zusammengeschriebene Wörter, auch mit Trennzeichen und Erhua', () => {
  assert.deepEqual(zerlege('míngtiān'), ['míng', 'tiān']);
  assert.deepEqual(zerlege("Xī'ān"), ['Xī', 'ān']);
  assert.deepEqual(zerlege('yìdiǎnr'), ['yì', 'diǎn', 'r']);
  assert.equal(zerlege('qqq'), null);
});

test('zählt die Silben eines Satzes ohne Satzzeichen', () => {
  assert.deepEqual(satzSilben('Nǐ hǎo, wǒ jiào Ānnà.'), { anzahl: 6 });
  // Erhua: „Nǐ qù nǎr?“ = 你去哪儿？, vier Zeichen.
  assert.deepEqual(satzSilben('Nǐ qù nǎr?'), { anzahl: 4 });
  assert.match(satzSilben('Wǒ xx.').fehler, /zerlegen/);
});

test('schreibt Wort-Pinyin wie im Wörterbuch', () => {
  assert.deepEqual(wortPinyin('péng.you'), { silben: ['péng', 'you'], form: 'péngyou' });
  assert.deepEqual(wortPinyin('shí.èr'), { silben: ['shí', 'èr'], form: "shí'èr" });
  assert.deepEqual(wortPinyin('zǎo.shang hǎo'), { silben: ['zǎo', 'shang', 'hǎo'], form: 'zǎoshang hǎo' });
});
