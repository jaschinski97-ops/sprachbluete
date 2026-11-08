import { DICTATION_CONFIG } from '@/data/dictation-config';
import { readingOf } from '@/data/vocab-helpers';
import { isJapaneseCounter, JAPANESE_COUNTERS } from '@/data/japanese-counters';
import { KANA, KANA_ROWS } from '@/data/japanese-kana';
import { numberWord, priceText } from '@/data/numbers';
import { VOCABULARY_JA } from '@/test-fixtures/vocabulary-ja';

import { pruefeVocabDoc } from '../content/vocab-schema';
import { zielwortImText } from '../conversation/dialog-words';
import { scoreDictation } from '../dictation/scoring';
import { buildJosushiQuestion, canBuildJosushiQuestion } from '../drills/questions';
import { seededRandom } from '../drills/random';
import { DRILL_META } from '../drills/types';
import { foundationSteps } from '../foundations';
import { buildWritingPrompt } from '../writing/prompt';

import { eigeneSchrift, LEARNING_LANGUAGES, ohneWortabstand, passtZurSchrift, zeigtUmschrift } from './definitions';

/**
 * Japanisch als neunte Lernsprache (07.11.2026): Zahlen und Preise aus
 * en.wikipedia „Japanese numerals“ / „Japanese yen“, die Kana-Tabelle aus
 * „Gojūon“, die Zählwort-Übung „つ, 本 oder 枚?“ und das Diktat je Zeichen.
 */

const ja = (id: string) => VOCABULARY_JA.find((entry) => entry.id === id)!;
const nfc = (text: string) => text.normalize('NFC');

describe('Japanisch: Schrift', () => {
  it('ist eine eigene Schrift ohne Wortabstand und mit Umschrift', () => {
    expect(LEARNING_LANGUAGES.ja.script).toBe('japanese');
    expect(eigeneSchrift('ja')).toBe(true);
    expect(ohneWortabstand('ja')).toBe(true);
    expect(zeigtUmschrift('ja')).toBe(true);
  });

  it('erkennt Kanji und Kana als Japanisch, Kana aber nicht als Chinesisch', () => {
    expect(passtZurSchrift('ja', '食べる')).toBe(true);
    expect(passtZurSchrift('ja', 'こんにちは')).toBe(true);
    expect(passtZurSchrift('ja', 'taberu')).toBe(false);
    expect(passtZurSchrift('zh', 'たべる')).toBe(false);
    expect(passtZurSchrift('th', '食べる')).toBe(false);
    expect(passtZurSchrift('en', 'こんにちは')).toBe(false);
  });
});

describe('Japanisch: Zahlen und Preise (Kapitel 0)', () => {
  it('schreibt 0–10 mit Kanji, Kana und Romaji', () => {
    expect(numberWord('ja', 1)).toEqual({ value: 1, text: '一', roman: 'いち · ichi' });
    expect(numberWord('ja', 4)).toMatchObject({ text: '四', roman: 'よん · yon' });
    expect(numberWord('ja', 10)).toMatchObject({ text: '十', roman: nfc('じゅう · jū') });
  });

  it('baut größere Zahlen aus Zehnern und Einern', () => {
    expect(numberWord('ja', 11)).toMatchObject({ text: '十一', roman: nfc('じゅういち · jūichi') });
    expect(numberWord('ja', 25)).toMatchObject({ text: '二十五', roman: nfc('にじゅうご · nijūgo') });
    expect(numberWord('ja', 100)).toMatchObject({ text: '百', roman: 'ひゃく · hyaku' });
  });

  it('nennt Preise in Yen', () => {
    expect(priceText('ja', 25)).toMatchObject({ text: '二十五円', roman: nfc('にじゅうごえん · nijūgo en'), label: '25円' });
    // Eine 4 am Ende wird vor 円 zu よ, die Zehner bleiben よん.
    expect(priceText('ja', 4)).toMatchObject({ text: '四円', roman: 'よえん · yo en' });
    expect(priceText('ja', 14).roman).toBe(nfc('じゅうよえん · jūyo en'));
    expect(priceText('ja', 40).roman).toBe(nfc('よんじゅうえん · yonjū en'));
  });
});

describe('Japanisch: Kapitel 0', () => {
  it('hat Zahlen, Preise und die Kana', () => {
    expect(foundationSteps('de_to_ja').map(([mode]) => mode)).toEqual(['zahlen', 'preise', 'kana']);
  });

  it('zeigt die 46 Grundzeichen in 11 Reihen zu je 5 Feldern', () => {
    expect(KANA).toHaveLength(46);
    expect(KANA_ROWS).toHaveLength(11);
    expect(KANA_ROWS.every((row) => row.length === 5)).toBe(true);
    expect(KANA_ROWS[0].map((zeichen) => zeichen?.hiragana).join('')).toBe('あいうえお');
    expect(KANA.find((zeichen) => zeichen.hiragana === 'し')).toEqual({ hiragana: 'し', katakana: 'シ', romaji: 'shi' });
    expect(KANA.find((zeichen) => zeichen.hiragana === 'を')?.romaji).toBe('o');
  });
});

describe('Japanisch: Zählwörter', () => {
  it('kennt die Zählwörter mit Lesung und unregelmäßigem „zwei“', () => {
    expect(isJapaneseCounter('本')).toBe(true);
    expect(isJapaneseCounter('猫')).toBe(false);
    expect(JAPANESE_COUNTERS['人']).toMatchObject({ zwei: 'ふたり', zweiRomaji: 'futari' });
    expect(JAPANESE_COUNTERS['つ']).toMatchObject({ zwei: 'ふたつ', zweiRomaji: 'futatsu' });
    expect(JAPANESE_COUNTERS['匹']).toMatchObject({ zwei: 'にひき', zweiRomaji: 'nihiki' });
  });
});

describe('Japanisch: „つ, 本 oder 枚?“', () => {
  it('ist eine Grammatikübung der Zielsprache', () => {
    expect(DRILL_META.josushi).toMatchObject({ side: 'toTarget', feature: 'ja', skill: 'grammatik' });
  });

  it('nimmt nur japanische Nomen mit Zählwort', () => {
    expect(canBuildJosushiQuestion(ja('ja_neko'))).toBe(true);
    expect(canBuildJosushiQuestion(ja('ja_taberu'))).toBe(false);
  });

  it('fragt das Zählwort und zeigt die Lösung mit „zwei“', () => {
    const frage = buildJosushiQuestion(ja('ja_neko'), seededRandom(1));
    expect(frage.visible).toBe('猫を 二 ___');
    expect(frage.options).toHaveLength(4);
    expect(frage.options[frage.correctIndex].label).toBe('匹');
    expect(frage.solution).toBe('猫を二匹');
    expect(frage.solutionRoman).toBe('neko o nihiki');
    expect(frage.direction).toBe('de_to_ja');
    expect(frage.options.every((option) => option.roman === JAPANESE_COUNTERS[option.label].romaji)).toBe(true);
  });

  it('bietet erlaubte Alternativen und つ nie als falsche Antwort an', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const wasser = buildJosushiQuestion(ja('ja_mizu'), seededRandom(seed));
      const labels = wasser.options.map((option) => option.label);
      expect(labels.filter((label) => label === '杯')).toHaveLength(1);
      expect(labels).not.toContain('本');
      expect(labels).not.toContain('つ');
    }
    expect(buildJosushiQuestion(ja('ja_tomodachi'), seededRandom(3)).solutionRoman).toBe('tomodachi o futari');
  });
});

describe('Japanisch: Lesung im Wort', () => {
  it('zeigt Kana vor dem Romaji, wenn das Wort Kanji hat', () => {
    expect(readingOf(ja('ja_taberu'))).toBe('たべる · taberu');
    expect(readingOf(ja('ja_konnichiwa'))).toBe('konnichiwa');
  });

  it('nimmt beim Schreiben die Kana-Lesung als richtige Antwort', () => {
    const aufgabe = buildWritingPrompt(ja('ja_taberu'), 'de_to_ja');
    expect(aufgabe.targets).toEqual(expect.arrayContaining(['食べる', 'たべる']));
    expect(aufgabe.solution).toBe('食べる · たべる · taberu');
  });
});

describe('Japanisch: Wortprüfung', () => {
  it('verlangt die Kana-Lesung und ein bekanntes Zählwort', () => {
    const gut = { ...ja('ja_neko') };
    const text = (doc: typeof gut) => pruefeVocabDoc(doc).fehler.join(' ');
    expect(text(gut)).not.toMatch(/Kana|Zählwort/);
    expect(text({ ...gut, kana: undefined })).toMatch(/ohne Kana-Lesung/);
    expect(text({ ...gut, kana: 'neko' })).toMatch(/andere Zeichen als Kana/);
    expect(text({ ...gut, japaneseNoun: { counter: '猫' } })).toMatch(/Unbekanntes Zählwort/);
  });
});

describe('Japanisch: Zielwörter im Dialog', () => {
  it('findet gebeugte Verben über den Stamm, wenn Kana folgen', () => {
    expect(zielwortImText(ja('ja_taberu'), '朝ご飯を食べました。')).toBe(true);
    expect(zielwortImText(ja('ja_iku'), '明日、駅に行きます。')).toBe(true);
    expect(zielwortImText(ja('ja_iku'), '銀行はどこですか。')).toBe(false);
    expect(zielwortImText(ja('ja_neko'), '猫が好きです。')).toBe(true);
  });
});

describe('Japanisch: Diktat je Zeichen', () => {
  const config = DICTATION_CONFIG.ja;

  it('wertet je Zeichen und übergeht Satzzeichen und Leerzeichen', () => {
    expect(config.script).toBe('japanese');
    expect(scoreDictation('水 を 飲みます', '水を飲みます。', config)).toMatchObject({ exact: true, passed: true, baseScore: 100 });
  });

  it('zählt ein falsches Zeichen als Teilfehler statt als ganzen Satz', () => {
    const score = scoreDictation('茶を飲みます', '水を飲みます。', config);
    expect(score.passed).toBe(false);
    expect(score.baseScore).toBeGreaterThan(0);
    expect(score.baseScore).toBeLessThan(100);
  });
});
