import { CHINESE_TONES } from '@/data/chinese-tones';
import { isMeasureWord, MEASURE_WORDS, yiVor } from '@/data/chinese-measure-words';
import { DICTATION_CONFIG } from '@/data/dictation-config';
import { numberWord, priceText } from '@/data/numbers';
import { VOCABULARY_ZH } from '@/test-fixtures/vocabulary-zh';

import { scoreDictation } from '../dictation/scoring';
import { buildLiangciQuestion, canBuildLiangciQuestion } from '../drills/questions';
import { seededRandom } from '../drills/random';
import { DRILL_META } from '../drills/types';
import { foundationSteps } from '../foundations';

import { eigeneSchrift, LEARNING_LANGUAGES, ohneWortabstand, passtZurSchrift, zeigtUmschrift } from './definitions';

/**
 * Chinesisch als achte Lernsprache (07.11.2026): Zahlen und Preise aus
 * en.wikipedia „Chinese numerals“ / „Renminbi“, Töne aus „Standard Chinese
 * phonology“, die Zählwort-Übung „个, 本 oder 杯?“ und das Diktat je
 * Schriftzeichen.
 */

const zh = (id: string) => VOCABULARY_ZH.find((entry) => entry.id === id)!;
const nfc = (text: string) => text.normalize('NFC');

describe('Chinesisch: Schrift', () => {
  it('ist eine eigene Schrift ohne Wortabstand und mit Pinyin', () => {
    expect(LEARNING_LANGUAGES.zh.script).toBe('han');
    expect(eigeneSchrift('zh')).toBe(true);
    expect(ohneWortabstand('zh')).toBe(true);
    expect(zeigtUmschrift('zh')).toBe(true);
    expect(passtZurSchrift('zh', '你好')).toBe(true);
    expect(passtZurSchrift('zh', 'ni hao')).toBe(false);
    expect(passtZurSchrift('th', '你好')).toBe(false);
  });
});

describe('Chinesisch: Zahlen und Preise (Kapitel 0)', () => {
  it('schreibt 0–10 wie die Quelle', () => {
    expect(numberWord('zh', 0)).toEqual({ value: 0, text: '零', roman: nfc('líng') });
    expect(numberWord('zh', 10)).toEqual({ value: 10, text: '十', roman: nfc('shí') });
  });

  it('lässt bei 11–19 das führende 一 weg', () => {
    expect(numberWord('zh', 11).text).toBe('十一');
    expect(numberWord('zh', 12)).toMatchObject({ text: '十二', roman: nfc("shí'èr") });
  });

  it('baut ab 20 Ziffer + 十 + Einer', () => {
    expect(numberWord('zh', 20)).toMatchObject({ text: '二十', roman: nfc('èrshí') });
    expect(numberWord('zh', 21)).toMatchObject({ text: '二十一', roman: nfc('èrshíyī') });
    expect(numberWord('zh', 99)).toMatchObject({ text: '九十九', roman: nfc('jiǔshíjiǔ') });
  });

  it('sagt 一百 und 一千 mit yì', () => {
    expect(numberWord('zh', 100)).toMatchObject({ text: '一百', roman: nfc('yìbǎi') });
    expect(numberWord('zh', 1000)).toMatchObject({ text: '一千', roman: nfc('yìqiān') });
  });

  it('nennt Preise in 块, mit 两 für zwei und yí vor kuài', () => {
    expect(priceText('zh', 1)).toEqual({ value: 1, text: '一块', roman: nfc('yí kuài'), label: '¥1' });
    expect(priceText('zh', 2)).toMatchObject({ text: '两块', roman: nfc('liǎng kuài') });
    expect(priceText('zh', 25)).toMatchObject({ text: '二十五块', roman: nfc('èrshíwǔ kuài'), label: '¥25' });
  });
});

describe('Chinesisch: Kapitel 0', () => {
  it('hat Zahlen, Preise und die Töne', () => {
    expect(foundationSteps('de_to_zh').map(([mode]) => mode)).toEqual(['zahlen', 'preise', 'toene']);
  });

  it('zeigt vier Töne plus den neutralen mit den Beispielen der Quelle', () => {
    expect(CHINESE_TONES.map((tone) => tone.example.hanzi).join('')).toBe('巴拔把爸吧');
    expect(CHINESE_TONES.map((tone) => tone.mark)).toEqual(['ā', 'á', 'ǎ', 'à', 'a'].map(nfc));
  });
});

describe('Chinesisch: Zählwörter', () => {
  it('kennt die Zählwörter mit Pinyin', () => {
    expect(isMeasureWord('本')).toBe(true);
    expect(isMeasureWord('书')).toBe(false);
    expect(MEASURE_WORDS['个']).toBe(nfc('gè'));
  });

  it('setzt 一 vor einem vierten Ton als yí, sonst als yì', () => {
    expect(yiVor(MEASURE_WORDS['个'])).toBe('yí');
    expect(yiVor(MEASURE_WORDS['本'])).toBe('yì');
    expect(yiVor(MEASURE_WORDS['杯'])).toBe('yì');
  });
});

describe('Chinesisch: „个, 本 oder 杯?“', () => {
  it('ist eine Grammatikübung der Zielsprache', () => {
    expect(DRILL_META.liangci).toMatchObject({ side: 'toTarget', feature: 'zh', skill: 'grammatik' });
  });

  it('nimmt nur chinesische Nomen mit Zählwort', () => {
    expect(canBuildLiangciQuestion(zh('zh_shu'))).toBe(true);
    expect(canBuildLiangciQuestion(zh('zh_chi'))).toBe(false);
  });

  it('fragt das Zählwort und zeigt die Lösung mit Tonänderung', () => {
    const frage = buildLiangciQuestion(zh('zh_shu'), seededRandom(1));
    expect(frage.visible).toBe('一 ___ 书');
    expect(frage.options).toHaveLength(4);
    expect(frage.options[frage.correctIndex].label).toBe('本');
    expect(frage.solution).toBe('一本书');
    expect(frage.solutionRoman).toBe(nfc('yì běn shū'));
    expect(frage.direction).toBe('de_to_zh');
    expect(frage.options.every((option) => option.roman === MEASURE_WORDS[option.label])).toBe(true);
  });

  it('bietet 个 und erlaubte Alternativen nie als falsche Antwort an', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const wasser = buildLiangciQuestion(zh('zh_shui'), seededRandom(seed));
      expect(wasser.options.map((option) => option.label)).not.toContain('瓶');
      expect(wasser.options.map((option) => option.label)).not.toContain('个');
      const freund = buildLiangciQuestion(zh('zh_pengyou'), seededRandom(seed));
      const labels = freund.options.map((option) => option.label);
      expect(labels.filter((label) => label === '个')).toHaveLength(1);
      expect(labels).not.toContain('位');
    }
    expect(buildLiangciQuestion(zh('zh_pengyou'), seededRandom(3)).solutionRoman).toBe(nfc('yí gè péngyou'));
  });
});

describe('Chinesisch: Diktat je Schriftzeichen', () => {
  const config = DICTATION_CONFIG.zh;

  it('wertet je Zeichen und übergeht Satzzeichen und Leerzeichen', () => {
    expect(config.script).toBe('han');
    expect(scoreDictation('我 喝 水', '我喝水。', config)).toMatchObject({ exact: true, passed: true, baseScore: 100 });
  });

  it('zählt ein falsches Zeichen als Teilfehler statt als ganzen Satz', () => {
    const score = scoreDictation('我喝茶', '我喝水。', config);
    expect(score.passed).toBe(false);
    expect(score.baseScore).toBeGreaterThan(0);
    expect(score.baseScore).toBeLessThan(100);
  });
});
