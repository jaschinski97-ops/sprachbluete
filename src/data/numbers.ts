import type { LanguageCode } from '@/lib/languages/types';

/**
 * Die Grundzahlen der Lernsprachen für Kapitel 0 „Grundlagen“
 * (18.10.2026, Französisch seit 04.11.2026, Portugiesisch, Italienisch und
 * Chinesisch seit 07.11.2026).
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
 *   fr — fr.wikipedia „Nombres en français“ (Tabelle „Adjectifs ou noms
 *        numéraux“ und Abschnitt „Règles“), abgerufen am 2026-11-04. Zahlen
 *        aus Frankreich (soixante-dix, quatre-vingts, quatre-vingt-dix, nicht
 *        die belgisch-schweizerischen septante/huitante/nonante). Bindestriche
 *        nach den Rectifications von 1990 („vingt-et-un“): Die Quelle nennt
 *        sie in Frankreich die Referenz; die traditionelle Schreibung
 *        „vingt et un“ sei „acceptée, mais ne doit plus être enseignée“.
 *   pt — pt.wikipedia „Numerais em língua portuguesa“ (Tabelle, Spalte der
 *        Kardinalzahlen: 0–20, Zehner, „Cem (cento, se o número aumentar …)“,
 *        „Mil“), dazu en.wiktionary „Appendix:Portuguese numbers“ für die
 *        Bildung 21–99 („vinte e um“, „vinte e dois“, „trinta e um“,
 *        „quarenta e um“) und die Landesformen („Brazil: dezesseis /
 *        Portugal: dezasseis“, ebenso dezessete, dezenove), abgerufen am
 *        2026-11-07. Brasilianische Formen; bei 14 nennt die Tabelle
 *        „Quatorze (ou catorze)“, die App nimmt die zuerst genannte.
 *   it — en.wiktionary „Appendix:Italian numbers“ (0–20, Zehner, 100) und
 *        it.wiktionary „Appendice:Tutti i numeri in lettere“ (Raster 0–9 ×
 *        Zehner bis 99, „| 1.000 || mille“), abgerufen am 2026-11-07. Das
 *        Raster zeigt jede zusammengesetzte Form: Vor uno und otto fällt der
 *        Endvokal des Zehners („ventuno“, „ventotto“, „quarantuno“,
 *        „novantotto“ — als Regel steht es in keiner der beiden Quellen, nur
 *        als Form in jeder Zelle); „Numbers ending in "3" (starting with
 *        twenty-) are stressed on the last syllable and written as -tré“.
 *   zh — en.wikipedia „Chinese numerals“ (Tabelle „ordinary Chinese
 *        numerals“: 零 líng … 十 shí, 百 bǎi, 千 qiān; Abschnitt „Whole
 *        numbers“: „Multiple-digit numbers are constructed using a
 *        multiplicative principle; first the digit itself (from 1 to 9), then
 *        the place (such as 10 or 100); then the next digit.“ und „For the
 *        numbers 11 through 19, the leading 'one' (一; yī) is usually
 *        omitted.“; Zeile 两: „Used instead of 二 before a classifier.“),
 *        abgerufen am 2026-11-07. Pinyin der Zahl zusammengeschrieben
 *        („èrshíyī“), mit Trennzeichen vor a/o/e („shí'èr“). 一 vor 百/千
 *        und vor 块 mit der üblichen Tonänderung (yìbǎi, yí kuài; en.wikipedia
 *        „Standard Chinese phonology“, Abschnitt „Tone sandhi“).
 *   ja — en.wikipedia „Japanese numerals“ (Tabelle mit Spalte „Preferred
 *        reading“: ゼロ zero, いち … じゅう, よんじゅう, ななじゅう,
 *        きゅうじゅう, ひゃく, せん; Tabelle „11 十一 jū ichi · Ten and one“,
 *        „151 百五十一 hyaku go-jū ichi“), abgerufen am 2026-11-07. Die
 *        Zahl steht in Kanji-Ziffern, die Lesung als Kana und Romaji
 *        (modifiziertes Hepburn wie im Katalog), zusammengeschrieben
 *        („にじゅういち · nijūichi“). 4, 7 und 9 in der bevorzugten Lesung
 *        (よん, なな, きゅう), 0 als ゼロ.
 *
 * THAI-UMSCHRIFT: Paiboon-Stil wie im Katalog (`thai-romanization.test.ts`),
 * Ton aus der IPA-Spalte der Quelle. Einzige bewusste Abweichung von der
 * IPA: เก้า steht wie im Obstmarkt-Dialog als „gâo“ (die Quelle schreibt
 * /kâːw/, die App-Umschrift kurzes ao — sonst stünde im Kapitel 0 eine andere
 * Schreibung als im Dialog direkt danach).
 *
 * WÄHRUNGEN: so, wie die A1-Marktdialoge des Katalogs bezahlen — Baht (Thai),
 * Pfund (Englisch), Euro (Spanisch, Deutsch, Französisch, Italienisch),
 * Real (Portugiesisch aus Brasilien; pt.wikipedia „Real (moeda brasileira)“:
 * „símbolo = R$“, „plural = Reais“, abgerufen am 2026-11-07), Yuan in der
 * Alltagsform 块 (Chinesisch; en.wikipedia „Renminbi“: „In everyday Mandarin,
 * kuai (Chinese: 块; pinyin: kuài; lit. 'piece') is usually used when
 * discussing money“, abgerufen am 2026-11-07), Yen (Japanisch; en.wikipedia
 * „Japanese yen“: „The yen (Japanese: 円; symbol: ¥; code: JPY)“, abgerufen
 * am 2026-11-07).
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
  fr: {
    title: 'Nombres en français',
    url: 'https://fr.wikipedia.org/wiki/Nombres_en_fran%C3%A7ais',
    retrieved: '2026-11-04',
  },
  pt: {
    title: 'Numerais em língua portuguesa',
    url: 'https://pt.wikipedia.org/wiki/Numerais_em_l%C3%ADngua_portuguesa',
    retrieved: '2026-11-07',
  },
  it: {
    title: 'Appendice:Tutti i numeri in lettere',
    url: 'https://it.wiktionary.org/wiki/Appendice:Tutti_i_numeri_in_lettere',
    retrieved: '2026-11-07',
  },
  zh: { title: 'Chinese numerals', url: 'https://en.wikipedia.org/wiki/Chinese_numerals', retrieved: '2026-11-07' },
  ja: { title: 'Japanese numerals', url: 'https://en.wikipedia.org/wiki/Japanese_numerals', retrieved: '2026-11-07' },
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

/** 0–19 aus der Tabelle der Quelle (17–19 „dix-sept, dix-huit, dix-neuf“). */
const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'] as const;
/** Zehner 20–60 der Tabelle; 70, 80 und 90 setzt `frenchWord` nach den Regeln der Quelle zusammen. */
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'] as const;

/** 0–20 der Tabelle, brasilianische Formen (dezesseis, dezessete, dezenove). */
const PT_UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'] as const;
const PT_TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'] as const;

const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
  'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'] as const;
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'] as const;

/** Chinesisch 0–10: Schriftzeichen und Pinyin der Quelle. */
const ZH_UNITS: readonly (readonly [string, string])[] = [
  ['零', 'líng'], ['一', 'yī'], ['二', 'èr'], ['三', 'sān'], ['四', 'sì'], ['五', 'wǔ'],
  ['六', 'liù'], ['七', 'qī'], ['八', 'bā'], ['九', 'jiǔ'], ['十', 'shí'],
].map(([zeichen, pinyin]) => [zeichen, pinyin.normalize('NFC')] as const);

/** Japanisch: Kanji-Ziffer, Kana und Romaji der bevorzugten Lesung (Spalte „Preferred reading“). */
const JA_UNITS: readonly (readonly [string, string, string])[] = [
  ['ゼロ', 'ゼロ', 'zero'], ['一', 'いち', 'ichi'], ['二', 'に', 'ni'], ['三', 'さん', 'san'], ['四', 'よん', 'yon'],
  ['五', 'ご', 'go'], ['六', 'ろく', 'roku'], ['七', 'なな', 'nana'], ['八', 'はち', 'hachi'], ['九', 'きゅう', 'kyū'],
  ['十', 'じゅう', 'jū'],
].map(([zeichen, kana, romaji]) => [zeichen, kana, romaji.normalize('NFC')] as const);

/** Ein Zahlwort in der Lernsprache; `roman` nur für eigene Schriften (Thai-Umschrift, Pinyin, Kana + Romaji). */
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

/**
 * Französisch nach der Quelle: „on ajoute les chiffres de 1 à 9 à la ou aux
 * dizaines …, sauf pour soixante-dix et quatre-vingt-dix, où on ajoute les
 * nombres de 11 à 19“; „et“ nur bei der 1 zwischen vingt und quatre-vingts
 * (21–71, also auch „soixante-et-onze“, aber „quatre-vingt-un“); 80 heißt
 * „quatre-vingts“, mit s nur ohne folgendes Zahlwort.
 */
function frenchWord(value: number): string {
  if (value < 20) return FR_UNITS[value];
  if (value === 100) return 'cent';
  if (value === 1000) return 'mille';
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  if (tens === 7 || tens === 9) {
    const base = tens === 7 ? 'soixante' : 'quatre-vingt';
    return tens === 7 && unit === 1 ? 'soixante-et-onze' : `${base}-${FR_UNITS[10 + unit]}`;
  }
  if (tens === 8) return unit === 0 ? 'quatre-vingts' : `quatre-vingt-${FR_UNITS[unit]}`;
  const base = FR_TENS[tens];
  if (unit === 0) return base;
  return unit === 1 ? `${base}-et-un` : `${base}-${FR_UNITS[unit]}`;
}

/** Portugiesisch: Zehner „e“ Einer („vinte e um“); 100 „cem“, 1000 „mil“. */
function portugueseWord(value: number): string {
  if (value < 20) return PT_UNITS[value];
  if (value === 100) return 'cem';
  if (value === 1000) return 'mil';
  const unit = value % 10;
  const tens = PT_TENS[Math.floor(value / 10)];
  return unit === 0 ? tens : `${tens} e ${PT_UNITS[unit]}`;
}

/**
 * Italienisch nach dem Raster der Quelle: Zehner und Einer in einem Wort, vor
 * uno und otto ohne Endvokal des Zehners (ventuno, trentotto), die 3 als
 * „-tré“ (ventitré).
 */
function italianWord(value: number): string {
  if (value < 20) return IT_UNITS[value];
  if (value === 100) return 'cento';
  if (value === 1000) return 'mille';
  const unit = value % 10;
  const tens = IT_TENS[Math.floor(value / 10)];
  if (unit === 0) return tens;
  if (unit === 1 || unit === 8) return `${tens.slice(0, -1)}${IT_UNITS[unit]}`;
  return `${tens}${unit === 3 ? 'tré' : IT_UNITS[unit]}`;
}

/** Pinyin-Silben zusammenschreiben, mit Trennzeichen vor a/o/e („shí'èr“). */
function pinyinJoin(silben: readonly string[]): string {
  return silben.reduce((wort, silbe) =>
    (wort && /^[aoeāáǎàōóǒòēéěè]/.test(silbe) ? `${wort}'${silbe}` : wort + silbe), '');
}

function chineseParts(value: number): (readonly [string, string])[] {
  if (value <= 10) return [ZH_UNITS[value]];
  // 一 vor 百 und 千 im vierten Ton (Tonänderung vor dem dritten/ersten Ton).
  if (value === 100) return [['一', 'yì'], ['百', 'bǎi']];
  if (value === 1000) return [['一', 'yì'], ['千', 'qiān']];
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  // 11–19 ohne führendes 一 (Quelle), ab 20 Ziffer + 十 + Einer.
  const parts: (readonly [string, string])[] = tens === 1 ? [ZH_UNITS[10]] : [ZH_UNITS[tens], ZH_UNITS[10]];
  if (unit) parts.push(ZH_UNITS[unit]);
  return parts;
}

/** Japanisch: Zehner + 十 + Einer (十一, 二十一), 11–19 ohne Ziffer vor 十; 百 und 千 ohne 一. */
function japaneseParts(value: number): (readonly [string, string, string])[] {
  if (value <= 10) return [JA_UNITS[value]];
  if (value === 100) return [['百', 'ひゃく', 'hyaku']];
  if (value === 1000) return [['千', 'せん', 'sen']];
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  const parts: (readonly [string, string, string])[] = tens === 1 ? [JA_UNITS[10]] : [JA_UNITS[tens], JA_UNITS[10]];
  if (unit) parts.push(JA_UNITS[unit]);
  return parts;
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
  if (language === 'fr') return { value, text: frenchWord(value) };
  if (language === 'pt') return { value, text: portugueseWord(value) };
  if (language === 'it') return { value, text: italianWord(value) };
  if (language === 'zh') {
    const parts = chineseParts(value);
    return { value, text: parts.map(([zeichen]) => zeichen).join(''), roman: pinyinJoin(parts.map(([, pinyin]) => pinyin)) };
  }
  if (language === 'ja') {
    const parts = japaneseParts(value);
    const kana = parts.map(([, k]) => k).join('');
    return { value, text: parts.map(([zeichen]) => zeichen).join(''), roman: `${kana} · ${parts.map(([, , r]) => r).join('')}` };
  }
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
 * un sustantivo masculino“); Deutsch zählt „ein Euro, zwei Euro“. Französisch:
 * „euro“ ist männlich, also „un euro“ (Quelle: 1 „écrit un au masculin et une
 * au féminin“), ab zwei „euros“. Portugiesisch: „real“ ist männlich (um
 * real, dois reais), Plural „reais“, Preisschild „R$ 5“. Italienisch: „un
 * euro“ (Quelle 1 = „uno, un“), danach unverändert — „il plurale di euro è
 * invariabile“ (it.wikipedia „Euro“, abgerufen am 2026-11-07). Chinesisch:
 * Zahl + 块 ohne Leerzeichen, 两 statt 二 vor dem Zählwort (Quelle: „Used
 * instead of 二 before a classifier“), 一块 als „yí kuài“ (一 vor viertem Ton).
 * Japanisch: Zahl + 円 ohne Leerzeichen („五十円“, „ごじゅうえん · gojū en“),
 * Preisschild wie im Laden „50円“. Eine 4 am Ende wird vor 円 zu よ: 四円
 * „よえん · yo en“, 十四円 „じゅうよえん“; 四十円 bleibt „よんじゅうえん“.
 * Quellen (abgerufen am 2026-11-08): MIT-Kurs Japanisch, Kanji-Quiz L.3
 * Frage 3 „四 yen“ (web.mit.edu/gleitz/Public/21fnew/kanji/kanji03-read/,
 * よえん richtig, よんえん falsch), yomikatawa.com „「四円」の読み方は？“
 * (よえん) und kan-sin.com „4円の読み方は「よえん」？“ (よえん, よんえん im
 * Gespräch geduldet).
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
  if (language === 'fr') {
    return { value, text: `${word.text} ${value === 1 ? 'euro' : 'euros'}`, label: `${value} €` };
  }
  if (language === 'pt') {
    return { value, text: `${word.text} ${value === 1 ? 'real' : 'reais'}`, label: `R$ ${value}` };
  }
  if (language === 'it') {
    return { value, text: `${value === 1 ? 'un' : word.text} euro`, label: `${value} €` };
  }
  if (language === 'zh') {
    const [zahl, pinyin] = value === 1 ? ['一', 'yí'] : value === 2 ? ['两', 'liǎng'] : [word.text, word.roman ?? ''];
    return { value, text: `${zahl}块`, roman: `${pinyin} kuài`.normalize('NFC'), label: `¥${value}` };
  }
  if (language === 'ja') {
    const [kana, romaji] = (word.roman ?? '').split(' · ');
    return { value, text: `${word.text}円`, roman: `${kana.replace(/よん$/, 'よ')}えん · ${romaji.replace(/yon$/, 'yo')} en`, label: `${value}円` };
  }
  return { value, text: `${value === 1 ? 'ein' : word.text} Euro`, label: `${value} €` };
}
