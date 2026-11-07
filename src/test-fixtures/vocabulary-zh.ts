/**
 * NUR TESTDATEN: ein kleiner chinesischer Wortsatz (07.11.2026), damit die
 * Tests auch die achte Lernsprache durchfahren — eigene Schrift ohne
 * Leerzeichen, Pinyin als Umschrift und die Zählwort-Übung (个, 本, 杯 …).
 * Die Begriffe (`concept`) sind dieselben wie im italienischen Testsatz.
 *
 * Nicht ausgeliefert: Der echte Wortschatz kommt über den Katalog.
 */
import type { VocabEntry } from '@/data/vocab-types';

const VERMERK = 'Testdaten (Claude), nicht ausgeliefert.';

function wort(
  id: string,
  concept: string,
  term: string,
  pinyin: string,
  silben: string[],
  german: string,
  partOfSpeech: VocabEntry['partOfSpeech'],
  extra: { measureWord?: string; alternatives?: string[]; isConcrete?: boolean; en?: string } = {}
): VocabEntry {
  return {
    id: `zh_${id}`,
    language: 'zh',
    concept,
    term,
    romanization: pinyin,
    syllables: silben.map((roman) => ({ roman })),
    german,
    ...(extra.en ? { translations: { en: extra.en } } : {}),
    ...(extra.measureWord
      ? { chineseNoun: { measureWord: extra.measureWord, ...(extra.alternatives ? { alternatives: extra.alternatives } : {}) } }
      : {}),
    partOfSpeech,
    register: 'neutral',
    isConcrete: extra.isConcrete ?? false,
    sourceVerified: false,
    verificationNote: VERMERK,
  };
}

export const VOCABULARY_ZH: VocabEntry[] = [
  wort('nihao', 'sawatdii', '你好', 'nǐ hǎo', ['nǐ', 'hǎo'], 'Hallo', 'interjection', { en: 'hello' }),
  wort('yi', 'nueng', '一', 'yī', ['yī'], 'eins', 'numeral', { en: 'one' }),
  wort('er', 'soong', '二', 'èr', ['èr'], 'zwei', 'numeral', { en: 'two' }),
  wort('chi', 'kin', '吃', 'chī', ['chī'], 'essen', 'verb', { en: 'to eat' }),
  wort('qu', 'bpai', '去', 'qù', ['qù'], 'gehen', 'verb', { en: 'to go' }),
  wort('shui', 'nam', '水', 'shuǐ', ['shuǐ'], 'das Wasser', 'noun', { measureWord: '杯', alternatives: ['瓶'], isConcrete: true, en: 'water' }),
  wort('mifan', 'khaao', '米饭', 'mǐfàn', ['mǐ', 'fàn'], 'der Reis', 'noun', { measureWord: '碗', isConcrete: true, en: 'rice' }),
  wort('fangzi', 'baan', '房子', 'fángzi', ['fáng', 'zi'], 'das Haus', 'noun', { measureWord: '座', alternatives: ['栋', '套'], isConcrete: true, en: 'house' }),
  wort('che', 'rot', '车', 'chē', ['chē'], 'das Auto', 'noun', { measureWord: '辆', isConcrete: true, en: 'car' }),
  wort('shichang', 'talaat', '市场', 'shìchǎng', ['shì', 'chǎng'], 'der Markt', 'noun', { measureWord: '个', isConcrete: true, en: 'market' }),
  wort('xuexiao', 'rongrian', '学校', 'xuéxiào', ['xué', 'xiào'], 'die Schule', 'noun', { measureWord: '所', alternatives: ['个'], isConcrete: true, en: 'school' }),
  wort('pengyou', 'phuean', '朋友', 'péngyou', ['péng', 'you'], 'der Freund', 'noun', { measureWord: '个', alternatives: ['位'], isConcrete: true, en: 'friend' }),
  wort('mao', 'maew', '猫', 'māo', ['māo'], 'die Katze', 'noun', { measureWord: '只', isConcrete: true, en: 'cat' }),
  wort('tang', 'naamtaan', '糖', 'táng', ['táng'], 'der Zucker', 'noun', { measureWord: '块', alternatives: ['包'], isConcrete: true, en: 'sugar' }),
  wort('shu', 'nangsue', '书', 'shū', ['shū'], 'das Buch', 'noun', { measureWord: '本', isConcrete: true, en: 'book' }),
];
