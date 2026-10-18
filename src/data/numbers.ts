import type { LanguageCode } from '@/lib/languages/types';

/**
 * Die Grundzahlen der vier Lernsprachen für Kapitel 0 „Grundlagen“
 * (18.10.2026).
 *
 * WARUM FESTE DATEN STATT KATALOG: Zahlen sind eine geschlossene Menge. Im
 * erzeugten Wortschatz fehlten ausgerechnet die häufigsten (Thai หนึ่ง bis
 * ร้อย, Englisch one/four/seven, Deutsch vier/fünf/zwanzig, Spanisch
 * uno/dos/veinte) — eine KI-Nacherzeugung würde Lücken zufällig füllen. Wie
 * `thai-script.ts` stehen die Grundwörter deshalb hier, mit Quelle und
 * Abrufdatum; alles darüber wird nach den Bildungsregeln derselben Quellen
 * zusammengesetzt, nicht abgetippt.
 *
 * QUELLEN, alle über die MediaWiki-API als Rohtext (`action=parse&prop=wikitext`)
 * abgerufen am 2026-10-18:
 *   th — en.wikipedia „Thai numerals“ (Tabellen „Zero to ten“, „Ten to a
 *        million“ mit Thai-Schrift, Ziffer und IPA).
 *   en — en.wikipedia „English numerals“ (Abschnitt „Cardinal numbers“).
 *   es — es.wikipedia „Anexo:Nombres de los números en español“ (vollständige
 *        Liste 10–99, Centenas, Millares).
 *   de — de.wikipedia „Zahlwort“ (Abschnitt „Bildung der Kardinalzahlen im
 *        Deutschen“, Tabelle Einer/Zehner/20 bis 90/ab 100).
 *
 * THAI-UMSCHRIFT: Paiboon-Stil wie im Katalog (`thai-romanization.test.ts`),
 * Ton aus der IPA-Spalte der Quelle. Einzige bewusste Abweichung von der
 * IPA: เก้า steht wie im Obstmarkt-Dialog als „gâo“ (die Quelle schreibt
 * /kâːw/, die App-Umschrift kurzes ao — sonst stünde im Kapitel 0 eine andere
 * Schreibung als im Dialog direkt danach).
 *
 * WÄHRUNGEN: so, wie die A1-Marktdialoge des Katalogs bezahlen — Baht (Thai),
 * Pfund (Englisch), Euro (Spanisch, Deutsch).
 */

export const NUMBER_SOURCES: Record<LanguageCode, { title: string; url: string; retrieved: string }> = {
  th: { title: 'Thai numerals', url: 'https://en.wikipedia.org/wiki/Thai_numerals', retrieved: '2026-10-18' },
  en: { title: 'English numerals', url: 'https://en.wikipedia.org/wiki/English_numerals', retrieved: '2026-10-18' },
  es: {
    title: 'Anexo:Nombres de los números en español',
    url: 'https://es.wikipedia.org/wiki/Anexo:Nombres_de_los_n%C3%BAmeros_en_espa%C3%B1ol',
    retrieved: '2026-10-18',
  },
  de: { title: 'Zahlwort', url: 'https://de.wikipedia.org/wiki/Zahlwort', retrieved: '2026-10-18' },
};

/** Ein Thai-Zahlbaustein: Schrift, Paiboon-Umschrift und IPA der Quelle. */
type ThaiPart = { text: string; roman: string; ipa: string };

const nfc = (text: string) => text.normalize('NFC');
const part = (text: string, roman: string, ipa: string): ThaiPart => ({ text, roman: nfc(roman), ipa });

/** 0–9, Tabelle „Zero to ten“. */
const THAI_UNITS: readonly ThaiPart[] = [
  part('ศูนย์', 'sǔun', '/sǔːn/'),
  part('หนึ่ง', 'nʉ̀ng', '/nɯ̀ŋ/'),
  part('สอง', 'sɔ̌ɔng', '/sɔ̌ːŋ/'),
  part('สาม', 'sǎam', '/sǎːm/'),
  part('สี่', 'sìi', '/sìː/'),
  part('ห้า', 'hâa', '/hâː/'),
  part('หก', 'hòk', '/hòk/'),
  part('เจ็ด', 'jèt', '/tɕèt/'),
  part('แปด', 'bpɛ̀ɛt', '/pɛ̀ːt/'),
  part('เก้า', 'gâo', '/kâːw/'),
];
const THAI_SIP = part('สิบ', 'sìp', '/sìp/');
/** „et for 1 as the ending digit in other cases“ (11, 21, 31 …). */
const THAI_ET = part('เอ็ด', 'èt', '/ʔèt/');
/** „yi for 2 as the tens digit, song in other cases“. */
const THAI_YI = part('ยี่', 'yîi', '/jîː/');
const THAI_ROI = part('ร้อย', 'rɔ́ɔi', '/rɔ́ːj/');
const THAI_PHAN = part('พัน', 'phan', '/pʰān/');

/** Thai-Ziffern ๐–๙ aus derselben Tabelle. */
export const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'] as const;

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'] as const;
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

/** 0–15 einzeln; 16–29 sind in der Quelle je ein Wort (mit Akzenten). */
const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'] as const;
const ES_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'] as const;

const DE_UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'] as const;
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'] as const;

/** Ein Zahlwort in der Lernsprache; `roman` nur für Thai. */
export type NumberWord = { value: number; text: string; roman?: string };

/** Bis wohin zusammengesetzt wird: 0–100 und 1000 — mehr braucht kein Marktdialog. */
export function isTeachableNumber(value: number): boolean {
  return Number.isInteger(value) && ((value >= 0 && value <= 100) || value === 1000);
}

function thaiParts(value: number): ThaiPart[] {
  if (value < 10) return [THAI_UNITS[value]];
  if (value === 100) return [THAI_UNITS[1], THAI_ROI];
  if (value === 1000) return [THAI_UNITS[1], THAI_PHAN];
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  // „Nueng never precedes sip“: 10 heißt nur สิบ.
  const head = tens === 1 ? [THAI_SIP] : tens === 2 ? [THAI_YI, THAI_SIP] : [THAI_UNITS[tens], THAI_SIP];
  const tail = unit === 0 ? [] : unit === 1 ? [THAI_ET] : [THAI_UNITS[unit]];
  return [...head, ...tail];
}

function englishWord(value: number): string {
  if (value < 20) return EN_UNITS[value];
  if (value === 100) return 'one hundred';
  if (value === 1000) return 'one thousand';
  const unit = value % 10;
  const tens = EN_TENS[Math.floor(value / 10)];
  return unit === 0 ? tens : `${tens}-${EN_UNITS[unit]}`;
}

function spanishWord(value: number): string {
  if (value < 30) return ES_UNITS[value];
  if (value === 100) return 'cien';
  if (value === 1000) return 'mil';
  const unit = value % 10;
  const tens = ES_TENS[Math.floor(value / 10)];
  return unit === 0 ? tens : `${tens} y ${ES_UNITS[unit]}`;
}

function germanWord(value: number): string {
  if (value < 20) return DE_UNITS[value];
  // Quelle: „(ein)hundert“ — gesprochen meist ohne „ein“, wie „tausend“ im Katalog.
  if (value === 100) return 'hundert';
  if (value === 1000) return 'tausend';
  const unit = value % 10;
  const tens = DE_TENS[Math.floor(value / 10)];
  // „zuerst die Einer, dann folgt und, dann kommen die Zehner“; eins → ein.
  return unit === 0 ? tens : `${unit === 1 ? 'ein' : DE_UNITS[unit]}und${tens}`;
}

/** Das Zahlwort zu `value` (0–100 oder 1000) in der Lernsprache. */
export function numberWord(language: LanguageCode, value: number): NumberWord {
  if (!isTeachableNumber(value)) throw new RangeError(`Zahl außerhalb von Kapitel 0: ${value}`);
  if (language === 'th') {
    const parts = thaiParts(value);
    return { value, text: parts.map((item) => item.text).join(''), roman: parts.map((item) => item.roman).join('-') };
  }
  if (language === 'en') return { value, text: englishWord(value) };
  if (language === 'es') return { value, text: spanishWord(value) };
  return { value, text: germanWord(value) };
}

/** Die Ziffernschreibung — für Thai mit den Thai-Ziffern daneben. */
export function thaiDigits(value: number): string {
  return String(value).split('').map((digit) => THAI_DIGITS[Number(digit)]).join('');
}

/** Die Zahlengruppen, die Kapitel 0 der Reihe nach zeigt. */
export const NUMBER_GROUPS: readonly { id: 'units' | 'teens' | 'tens' | 'large'; values: readonly number[] }[] = [
  { id: 'units', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: 'teens', values: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { id: 'tens', values: [10, 20, 30, 40, 50, 60, 70, 80, 90] },
  { id: 'large', values: [100, 1000] },
];

/** Zusammengesetzte Beispiele: Zehner plus Einer, darunter die Sonderfälle 21 und 31. */
export const NUMBER_EXAMPLES: readonly number[] = [21, 22, 31, 45, 58, 99];

/** Ein Preis in der Währung des Marktdialogs: gesprochen und als Preisschild. */
export type PriceText = { value: number; text: string; roman?: string; label: string };

/**
 * Preis als Satzteil. Thai wie im Obstmarkt-Dialog ohne Leerzeichen
 * („ห้าสิบบาท“, „hâa-sìp bàat“); Spanisch kürzt uno vor dem männlichen
 * „euro“ zu un (Quelle: „apocopan el uno en un … si la palabra que sigue es
 * un sustantivo masculino“); Deutsch zählt „ein Euro, zwei Euro“.
 */
export function priceText(language: LanguageCode, value: number): PriceText {
  const word = numberWord(language, value);
  if (language === 'th') {
    return { value, text: `${word.text}บาท`, roman: `${word.roman} ${nfc('bàat')}`, label: `${value} ฿` };
  }
  if (language === 'en') {
    return { value, text: value === 1 ? 'one pound' : `${word.text} pounds`, label: `£${value}` };
  }
  if (language === 'es') {
    const counted = word.text.endsWith('veintiuno') ? word.text.replace(/veintiuno$/, 'veintiún') : word.text.replace(/uno$/, 'un');
    return { value, text: `${counted} ${value === 1 ? 'euro' : 'euros'}`, label: `${value} €` };
  }
  return { value, text: `${value === 1 ? 'ein' : word.text} Euro`, label: `${value} €` };
}
