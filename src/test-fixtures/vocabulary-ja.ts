/**
 * NUR TESTDATEN: ein kleiner japanischer Wortsatz (07.11.2026), damit die
 * Tests auch die neunte Lernsprache durchfahren — Kanji und Kana ohne
 * Leerzeichen, Kana-Lesung plus Romaji und die Zählwort-Übung (本, 枚, 匹 …).
 * Die Begriffe (`concept`) sind dieselben wie im chinesischen Testsatz.
 *
 * Nicht ausgeliefert: Der echte Wortschatz kommt über den Katalog.
 */
import type { VocabEntry } from '@/data/vocab-types';

const VERMERK = 'Testdaten (Claude), nicht ausgeliefert.';

function wort(
  id: string,
  concept: string,
  term: string,
  kana: string,
  romaji: string,
  german: string,
  partOfSpeech: VocabEntry['partOfSpeech'],
  extra: { counter?: string; alternatives?: string[]; isConcrete?: boolean; en?: string } = {}
): VocabEntry {
  return {
    id: `ja_${id}`,
    language: 'ja',
    concept,
    term,
    kana,
    romanization: romaji.normalize('NFC'),
    syllables: [],
    german,
    ...(extra.en ? { translations: { en: extra.en } } : {}),
    ...(extra.counter
      ? { japaneseNoun: { counter: extra.counter, ...(extra.alternatives ? { alternatives: extra.alternatives } : {}) } }
      : {}),
    partOfSpeech,
    register: 'neutral',
    isConcrete: extra.isConcrete ?? false,
    sourceVerified: false,
    verificationNote: VERMERK,
  };
}

export const VOCABULARY_JA: VocabEntry[] = [
  wort('konnichiwa', 'sawatdii', 'こんにちは', 'こんにちは', 'konnichiwa', 'Hallo', 'interjection', { en: 'hello' }),
  wort('ichi', 'nueng', '一', 'いち', 'ichi', 'eins', 'numeral', { en: 'one' }),
  wort('ni', 'soong', '二', 'に', 'ni', 'zwei', 'numeral', { en: 'two' }),
  wort('taberu', 'kin', '食べる', 'たべる', 'taberu', 'essen', 'verb', { en: 'to eat' }),
  wort('iku', 'bpai', '行く', 'いく', 'iku', 'gehen', 'verb', { en: 'to go' }),
  wort('mizu', 'nam', '水', 'みず', 'mizu', 'das Wasser', 'noun', { counter: '杯', alternatives: ['本'], isConcrete: true, en: 'water' }),
  wort('gohan', 'khaao', 'ご飯', 'ごはん', 'gohan', 'der Reis', 'noun', { counter: '杯', isConcrete: true, en: 'rice' }),
  wort('ie', 'baan', '家', 'いえ', 'ie', 'das Haus', 'noun', { counter: '軒', isConcrete: true, en: 'house' }),
  wort('kuruma', 'rot', '車', 'くるま', 'kuruma', 'das Auto', 'noun', { counter: '台', isConcrete: true, en: 'car' }),
  wort('ichiba', 'talaat', '市場', 'いちば', 'ichiba', 'der Markt', 'noun', { counter: 'つ', isConcrete: true, en: 'market' }),
  wort('gakkou', 'rongrian', '学校', 'がっこう', 'gakkō', 'die Schule', 'noun', { counter: 'つ', isConcrete: true, en: 'school' }),
  wort('tomodachi', 'phuean', '友達', 'ともだち', 'tomodachi', 'der Freund', 'noun', { counter: '人', isConcrete: true, en: 'friend' }),
  wort('neko', 'maew', '猫', 'ねこ', 'neko', 'die Katze', 'noun', { counter: '匹', isConcrete: true, en: 'cat' }),
  wort('kami', 'kradaat', '紙', 'かみ', 'kami', 'das Papier', 'noun', { counter: '枚', isConcrete: true, en: 'paper' }),
  wort('hon', 'nangsue', '本', 'ほん', 'hon', 'das Buch', 'noun', { counter: '冊', isConcrete: true, en: 'book' }),
];
