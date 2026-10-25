import type { Tone } from '@/constants/tones';
import { TONE_KEYS } from '@/constants/tones';
import { isLatinLanguage, isSpellable, type LatinLanguage } from '@/data/latin-alphabet';
import { isTeachableNumber } from '@/data/numbers';
import { TONE_RULES, VOWEL_PATTERNS, type ThaiConsonant, type VowelPattern } from '@/data/thai-script';
import type { VocabEntry } from '@/data/vocab-types';

import { shuffled, type Random } from './drills/random';
import type { Mode } from './exercise-catalog';
import type { TranslationKey } from './i18n';
import { targetLanguageOf, type LanguageCode, type PairDirection } from './languages/types';

/**
 * Kapitel 0 „Grundlagen“ (18.10.2026): Zahlen und Schrift, bevor der erste
 * Dialog kommt. Durchsicht am 18.10.: Thai begann mit sechs Dialogkapiteln,
 * Zahlen und Schrift wurden nirgends eingeführt — Kapitel 2 ist aber der
 * Obstmarkt mit Preisen, und Kapitel 1 setzte Tonbegriffe voraus.
 *
 * Das Kapitel ist kein Dialogkapitel (`LearningChapter` braucht eine Szene),
 * teilt aber Häkchen und Abschluss über dieselbe Kennung mit dem Lernpfad.
 */
export const FOUNDATIONS_ID = 'grundlagen';

/** Die eigenen Übungsmodi von Kapitel 0. */
export const FOUNDATION_MODES = ['zahlen', 'preise', 'abc', 'buchstabieren', 'konsonanten', 'vokale', 'toene'] as const;
export type FoundationMode = (typeof FOUNDATION_MODES)[number];

export function isFoundationMode(mode: string): mode is FoundationMode {
  return (FOUNDATION_MODES as readonly string[]).includes(mode);
}

export type FoundationStep = readonly [Mode, TranslationKey];

/**
 * Die Schritte von Kapitel 0. Thai: Zahlen, Preise, dann die Schrift
 * (Konsonanten → ihre Klasse → Vokalzeichen) und zuletzt die fünf Töne mit
 * der vorhandenen Hörübung. Lateinisch geschriebene Sprachen: Zahlen,
 * Preise, das ABC mit Buchstabennamen und Buchstabieren.
 */
export function foundationSteps(direction: PairDirection): FoundationStep[] {
  const numbers: FoundationStep[] = [
    ['zahlen', 'foundations.numbers'],
    ['preise', 'foundations.prices'],
  ];
  if (targetLanguageOf(direction) === 'th') {
    return [
      ...numbers,
      ['konsonanten', 'foundations.consonants'],
      ['konsonantenklasse', 'drill.konsonantenklasse'],
      ['vokale', 'foundations.vowels'],
      ['toene', 'foundations.tones'],
      ['tone', 'drill.tone'],
    ];
  }
  return [...numbers, ['abc', 'foundations.alphabet'], ['buchstabieren', 'foundations.spelling']];
}

/** Die Kapitel-0-Modi einer Richtung — sie gelten auch als Adresse (`?mode=`). */
export function foundationModesFor(direction: PairDirection): FoundationMode[] {
  return foundationSteps(direction).map(([mode]) => mode).filter(isFoundationMode);
}

/* ------------------------------------------------------------------ *
 * Zahlen und Preise                                                   *
 * ------------------------------------------------------------------ */

/** Was in der Zahlenrunde abgefragt wird: alle Grundzahlen plus Beispiele. */
export const NUMBER_QUIZ_VALUES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 30, 31, 40, 45, 50, 58, 60, 70, 80, 90, 99, 100, 1000,
];

/** Preise wie auf dem Markt — runde Beträge und ein paar krumme. */
export const PRICE_QUIZ_VALUES: readonly number[] = [1, 2, 4, 5, 6, 10, 12, 15, 20, 21, 25, 30, 35, 40, 45, 50, 60, 75, 80, 90, 95, 100];

export type ChoiceQuestion<T> = { answer: T; options: T[]; correctIndex: number };

/**
 * Ablenker, an denen Lernende wirklich scheitern: Nachbarzahl, ±10,
 * vertauschte Ziffern (45/54) und Zehner gegen -zehn/-teen (14/40).
 */
function confusableNumbers(value: number): number[] {
  const out = [value + 1, value - 1, value + 10, value - 10];
  if (value >= 10 && value < 100) out.push(Number(String(value).split('').reverse().join('')));
  if (value >= 13 && value <= 19) out.push((value - 10) * 10);
  if (value >= 30 && value <= 90 && value % 10 === 0) out.push(value / 10 + 10);
  if (value === 100) out.push(1000, 10);
  if (value === 1000) out.push(100, 10);
  return out;
}

function numberQuestion(value: number, pool: readonly number[], random: Random): ChoiceQuestion<number> {
  const near = shuffled(confusableNumbers(value).filter((n) => n !== value && isTeachableNumber(n)), random);
  const rest = shuffled(pool.filter((n) => n !== value), random);
  const distractors = [...new Set([...near.slice(0, 2), ...rest])].slice(0, 3);
  const options = shuffled([value, ...distractors], random);
  return { answer: value, options, correctIndex: options.indexOf(value) };
}

/** Eine Zahlen- oder Preisrunde: jede Zahl höchstens einmal, vier Antworten. */
export function numberQuestions(values: readonly number[], random: Random, size = 10): ChoiceQuestion<number>[] {
  return shuffled(values, random).slice(0, size).map((value) => numberQuestion(value, values, random));
}

/* ------------------------------------------------------------------ *
 * Buchstabieren                                                       *
 * ------------------------------------------------------------------ */

/**
 * Wörter zum Buchstabieren: aus dem ausgelieferten Wortschatz, kurz (3–7
 * Buchstaben), nur Buchstaben des ABC (keine Akzente, Leer- oder
 * Bindestriche) und in Erzeugungsreihenfolge — der Erzeuger schreibt
 * häufige Wörter zuerst. Nichts davon ist für Kapitel 0 erfunden.
 */
export function spellingWords(language: LatinLanguage, entries: readonly VocabEntry[], limit = 80): VocabEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .filter((entry) => String(entry.language) === language && (entry.learningStage ?? 'beginner') === 'beginner')
    .filter((entry) => entry.term.length >= 3 && entry.term.length <= 7 && isSpellable(language, entry.term))
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id))
    .filter((entry) => {
      const key = entry.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** Wort buchstabiert hören/lesen, dann das Wort wählen. Ablenker mit gleichem Anfang oder gleicher Länge. */
export function spellingQuestions(words: readonly VocabEntry[], random: Random, size = 8): ChoiceQuestion<VocabEntry>[] {
  if (words.length < 4) return [];
  return shuffled(words, random).slice(0, size).map((answer) => {
    const others = words.filter((word) => word.id !== answer.id);
    const similar = shuffled(others.filter((word) =>
      word.term[0].toLowerCase() === answer.term[0].toLowerCase() || word.term.length === answer.term.length), random);
    const distractors = [...new Set([...similar.slice(0, 2), ...shuffled(others, random)])].slice(0, 3);
    const options = shuffled([answer, ...distractors], random);
    return { answer, options, correctIndex: options.indexOf(answer) };
  });
}

export function hasAlphabet(language: LanguageCode): language is LatinLanguage {
  return isLatinLanguage(language);
}

/* ------------------------------------------------------------------ *
 * Thai: Konsonantennamen                                              *
 * ------------------------------------------------------------------ */

/** Anlaut-IPA der Quelle → Paiboon-Anlaut der App-Umschrift. */
const PAIBOON_INITIAL: Record<string, string> = {
  '/k/': 'g', '/kʰ/': 'kh', '/ŋ/': 'ng', '/tɕ/': 'j', '/tɕʰ/': 'ch', '/s/': 's', '/j/': 'y', '/d/': 'd',
  '/t/': 'dt', '/tʰ/': 'th', '/n/': 'n', '/b/': 'b', '/p/': 'bp', '/pʰ/': 'ph', '/f/': 'f', '/m/': 'm',
  '/r/': 'r', '/l/': 'l', '/w/': 'w', '/h/': 'h', '/ʔ/': '',
};

const TONE_DIACRITIC: Record<Tone, string> = { mid: '', low: '̀', falling: '̂', high: '́', rising: '̌' };

/**
 * Der gesprochene Name eines Konsonanten, etwa ข → „khɔ̌ɔ“.
 *
 * HERGELEITET, NICHT ABGETIPPT: Thai nennt jeden Konsonanten mit dem
 * Vokal ɔɔ. Die Silbe ist lebend (langer Vokal), also kommt ihr Ton aus
 * `TONE_RULES.unmarked.live` und der Klasse — Hochklasse steigend, sonst
 * mittel. Der Anlaut kommt aus der IPA-Spalte von `thai-script.ts`; bei ฑ
 * („/tʰ/ or /d/“) gilt die erste Lesart.
 */
export function thaiConsonantSyllable(consonant: ThaiConsonant): string {
  const ipa = consonant.initialIpa.split(' or ')[0];
  const initial = PAIBOON_INITIAL[ipa];
  if (initial === undefined) throw new RangeError(`Kein Paiboon-Anlaut für ${consonant.symbol} (${ipa})`);
  const tone = TONE_RULES.unmarked.live[consonant.consonantClass];
  return `${initial}ɔ${TONE_DIACRITIC[tone]}ɔ`.normalize('NFC');
}

/** Ein Vokal mit dem Tonzeichen der Umschrift: a, à, â, á, ǎ. */
export function toneMarkedVowel(tone: Tone): string {
  return `a${TONE_DIACRITIC[tone]}`.normalize('NFC');
}

/** Das Merkwort des Konsonanten, z. B. ไก่ aus „ก ไก่“. */
export function thaiConsonantKeyword(consonant: ThaiConsonant): string {
  return consonant.name.split(' ').slice(1).join(' ');
}

/**
 * Umschrift der 44 Merkwörter im Paiboon-Stil der App (25.10.2026). Vorher
 * kam sie aus dem Wortschatz; seit dem Neuaufbau stehen viele Merkwörter
 * (ฉิ่ง, ปฏัก, ฤๅษี …) dort nicht mehr, und die Kachel zeigte nur „chɔ̌ɔ“.
 * Feste Tabelle statt Wortschatz: Ein Test prüft jede Zeile gegen die
 * Tonregeln aus der Schrift und den Umschrift-Wächter.
 */
export const MERKWORT_UMSCHRIFT: Readonly<Record<string, string>> = {
  'ไก่': 'gài', 'ไข่': 'khài', 'ขวด': 'khùat', 'ควาย': 'khwaai', 'คน': 'khon', 'ระฆัง': 'rá-khang',
  'งู': 'nguu', 'จาน': 'jaan', 'ฉิ่ง': 'chìng', 'ช้าง': 'cháang', 'โซ่': 'sôo', 'เฌอ': 'chəə',
  'หญิง': 'yǐng', 'ชฎา': 'chá-daa', 'ปฏัก': 'bpà-dtàk', 'ฐาน': 'thǎan', 'มณโฑ': 'mon-thoo',
  'ผู้เฒ่า': 'phûu-thâo', 'เณร': 'neen', 'เด็ก': 'dèk', 'เต่า': 'dtào', 'ถุง': 'thǔng',
  'ทหาร': 'thá-hǎan', 'ธง': 'thong', 'หนู': 'nǔu', 'ใบไม้': 'bai-máai', 'ปลา': 'bplaa',
  'ผึ้ง': 'phʉ̂ng', 'ฝา': 'fǎa', 'พาน': 'phaan', 'ฟัน': 'fan', 'สำเภา': 'sǎm-phao', 'ม้า': 'máa',
  'ยักษ์': 'yák', 'เรือ': 'rʉa', 'ลิง': 'ling', 'แหวน': 'wɛ̌ɛn', 'ศาลา': 'sǎa-laa', 'ฤๅษี': 'rʉʉ-sǐi',
  'เสือ': 'sʉ̌a', 'หีบ': 'hìip', 'จุฬา': 'jù-laa', 'อ่าง': 'àang', 'นกฮูก': 'nók-hûuk',
};

/** Umschrift des Merkworts, z. B. „gài“ für ก. */
export function thaiConsonantKeywordRoman(consonant: ThaiConsonant): string | null {
  return MERKWORT_UMSCHRIFT[thaiConsonantKeyword(consonant)] ?? null;
}

/** Was die Stimme liest: der Name in Thai-Schrift, ก → „กอ ไก่“. */
export function thaiConsonantSpoken(consonant: ThaiConsonant): string {
  return `${consonant.symbol}อ ${thaiConsonantKeyword(consonant)}`;
}

/* ------------------------------------------------------------------ *
 * Thai: Vokalzeichen                                                  *
 * ------------------------------------------------------------------ */

/**
 * Die Vokale für den Einstieg als Paare kurz/lang, dazu vier Sonderzeichen.
 * Jede Angabe ist ein Muster aus `VOWEL_PATTERNS` (Quelle „Thai script“),
 * hier nur ausgewählt und gepaart; Muster mit Schlusskonsonant stehen als
 * zweite Form daneben, damit Beispielwörter wie ปลา und คน beide passen.
 */
export const FOUNDATION_VOWELS: readonly { short: readonly string[]; long: readonly string[] }[] = [
  { short: ['◌ะ', '◌ั◌'], long: ['◌า', '◌า◌'] },
  { short: ['◌ิ◌'], long: ['◌ี◌'] },
  { short: ['◌ึ◌'], long: ['◌ือ', '◌ื◌'] },
  { short: ['◌ุ◌'], long: ['◌ู◌'] },
  { short: ['เ◌ะ', 'เ◌็◌'], long: ['เ◌', 'เ◌◌'] },
  { short: ['แ◌ะ', 'แ◌็◌'], long: ['แ◌', 'แ◌◌'] },
  { short: ['โ◌ะ'], long: ['โ◌', 'โ◌◌'] },
  { short: ['เ◌าะ', '◌็อ◌'], long: ['◌อ', '◌อ◌'] },
  { short: ['เ◌อะ'], long: ['เ◌อ', 'เ◌อ◌', 'เ◌ิ◌'] },
  { short: ['เ◌ียะ'], long: ['เ◌ีย', 'เ◌ีย◌'] },
  { short: ['เ◌ือะ'], long: ['เ◌ือ', 'เ◌ือ◌'] },
  { short: ['◌ัวะ'], long: ['◌ัว', '◌ว◌'] },
];

/** Vokale, die selbst auf -m, -i oder -o enden. */
export const FOUNDATION_SPECIAL_VOWELS: readonly string[] = ['◌ำ', 'ไ◌', 'ใ◌', 'เ◌า'];

const PAIBOON_VOWEL: Record<string, string> = {
  'a': 'a', 'aː': 'aa', 'i': 'i', 'iː': 'ii', 'ɯ': 'ʉ', 'ɯː': 'ʉʉ', 'u': 'u', 'uː': 'uu', 'e': 'e', 'eː': 'ee',
  'ɛ': 'ɛ', 'ɛː': 'ɛɛ', 'o': 'o', 'oː': 'oo', 'ɔ': 'ɔ', 'ɔː': 'ɔɔ', 'ɤ': 'ə', 'ɤː': 'əə', 'ia': 'ia', 'ɯa': 'ʉa',
  'ua': 'ua', 'am': 'am', 'aj': 'ai', 'aw': 'ao',
};

export function vowelPattern(display: string): VowelPattern {
  const found = VOWEL_PATTERNS.find((pattern) => pattern.display === display);
  if (!found) throw new RangeError(`Vokalmuster ${display} fehlt in thai-script.ts`);
  return found;
}

/** IPA der Quelle (`/aː/`, `/aʔ/`) → Paiboon-Vokal der App (`aa`, `a`). */
export function paiboonVowel(pattern: VowelPattern): string {
  const core = pattern.ipa.replace(/^\/|\/$/g, '').replace('ʔ', '');
  const roman = PAIBOON_VOWEL[core];
  if (!roman) throw new RangeError(`Kein Paiboon-Vokal für ${pattern.display} (${pattern.ipa})`);
  return roman;
}

/* ------------------------------------------------------------------ *
 * Thai: die fünf Töne                                                 *
 * ------------------------------------------------------------------ */

/**
 * Beispielwörter je Ton aus dem Katalog: einsilbig und in Erzeugungs-
 * reihenfolge. Ob ein tongeprüfter Clip dazu existiert, entscheidet erst
 * die Anzeige (`hasPronunciationClip` mit Zweck „tone“) — ohne Clip steht
 * das Wort nur geschrieben da, die Systemstimme spricht hier nie.
 */
export function toneExampleCandidates(entries: readonly VocabEntry[], perTone = 12): Record<Tone, VocabEntry[]> {
  const monosyllables = [...entries]
    .filter((entry) => String(entry.language) === 'th' && entry.syllables.length === 1 && entry.syllables[0].tone)
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id));
  return Object.fromEntries(TONE_KEYS.map((tone) => [
    tone,
    monosyllables.filter((entry) => entry.syllables[0].tone === tone).slice(0, perTone),
  ])) as Record<Tone, VocabEntry[]>;
}
