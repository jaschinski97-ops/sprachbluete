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

test('zerlegt ohne Apostroph nie in eine Silbe mit a/o/e am Anfang', () => {
  // kěnéng ist kě+néng (sonst stünde kěn'éng), dàngāo ist dàn+gāo.
  assert.deepEqual(zerlege('kěnéng'), ['kě', 'néng']);
  assert.deepEqual(zerlege('dàngāo'), ['dàn', 'gāo']);
  assert.deepEqual(zerlege('Jiānádà'), ['Jiā', 'ná', 'dà']);
  assert.deepEqual(zerlege("pí'ǎo"), ['pí', 'ǎo']);
});

/* ---------- Abgleich mit CC-CEDICT (pinyin-woerterbuch.cjs) ---------- */

const { leseCedict, pruefe, satzSilbenListe } = require('../../content-plan/pinyin-woerterbuch.cjs');

// Kleiner Auszug im CEDICT-Format (mit CRLF wie die echte Datei).
const AUSZUG = [
  '# CC-CEDICT Auszug',
  '蛋糕 蛋糕 [dan4 gao1] /cake/',
  '蛋 蛋 [dan4] /egg/',
  '糕 糕 [gao1] /cake/',
  '一 一 [yi1] /one/',
  '個 个 [ge4] /classifier/',
  '不 不 [bu4] /no/',
  '是 是 [shi4] /is/',
  '朋友 朋友 [peng2 you5] /friend/',
  '道理 道理 [dao4 li3] /reason/',
  '道 道 [dao4] /road/',
  '理 理 [li3] /reason/',
  '哪兒 哪儿 [na3 r5] /where/',
  '哪 哪 [na3] /which/',
  '兒 儿 [er2] /son/',
  '還 还 [hai2] /still/',
  '還 还 [huan2] /to return/',
  '還有 还有 [hai2 you3] /furthermore/',
  '有 有 [you3] /to have/',
  '牛奶 牛奶 [niu2 nai3] /milk/',
  '和 和 [he2] /and/',
  '和 和 [huo2] /to mix/',
  '和麵 和面 [huo2 mian4] /to knead dough/',
  '麵包 面包 [mian4 bao1] /bread/',
  '面 面 [mian4] /face/',
  '包 包 [bao1] /bag/',
  '下載 下载 [xia4 zai3] /to download/also pr. [xia4zai4]/',
  '下 下 [xia4] /down/',
  '載 载 [zai3] /year/',
  '載 载 [zai4] /to carry/',
  '血 血 [xue4] /blood/colloquial pr. [xie3]/',
].join('\r\n');
const buch = leseCedict(AUSZUG);
const arten = (text, pinyin) => pruefe(buch, text, satzSilbenListe(pinyin)).befunde.map((b) => `${b.art}:${b.stelle}`);

test('liest CEDICT mit Nebenlesungen („also pr.“ auch ohne Leerzeichen, „colloquial pr.“)', () => {
  assert.deepEqual(buch.woerter.get('蛋糕'), [['dan4', 'gao1']]);
  assert.deepEqual(buch.woerter.get('下载'), [['xia4', 'zai3'], ['xia4', 'zai4']]);
  assert.deepEqual(buch.woerter.get('血'), [['xue4'], ['xie3']]);
});

test('lässt richtige Lesungen durch, auch 一/不 mit Tonänderung und Erhua', () => {
  assert.deepEqual(arten('蛋糕', 'dàngāo'), []);
  assert.deepEqual(arten('一个', 'yí gè'), []);
  assert.deepEqual(arten('不是', 'bú shì'), []);
  assert.deepEqual(arten('朋友', 'péngyou'), []);
  assert.deepEqual(arten('哪儿', 'nǎr'), []);
  assert.deepEqual(arten('下载', 'xiàzài'), []);
});

test('meldet falsche Töne als Fehler, neutralen gegen vollen Ton nur als Hinweis', () => {
  assert.deepEqual(arten('蛋糕', 'dàngào'), ['fehler:糕']);
  assert.deepEqual(arten('道理', 'dàoli'), ['neutral:理']);
});

test('Verdacht bei Mehrfach-Lesung im Wort, aber nicht über Wortgrenzen hinweg', () => {
  // 还有 hái yǒu: huán ist eine Lesung von 还, im Wort aber falsch.
  assert.deepEqual(arten('还有', 'huán yǒu'), ['verdacht:还有']);
  // 牛奶和面包: 面包 schneidet 和面 (huómiàn) — kein Verdacht.
  assert.deepEqual(arten('牛奶和面包', 'niúnǎi hé miànbāo'), []);
});

test('Sätze mit Ziffern sind nicht prüfbar', () => {
  assert.equal(pruefe(buch, '我有3个', satzSilbenListe('Wǒ yǒu sān gè')).nichtPruefbar, 'Ziffern oder lateinische Buchstaben');
});
