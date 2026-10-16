import { Tone } from '@/constants/tones';

/**
 * Die Schriftregeln des Thai (Phase 13).
 *
 * WARUM ES DIESE DATEI GIBT: Bis hierher zeigte die App Thai-Schrift, lehrte
 * sie aber nicht. Der Ton einer Silbe musste damit Wort fuer Wort auswendig
 * gelernt werden — obwohl er im Thai weitgehend **ableitbar** ist, aus
 * Konsonantenklasse, Vokallaenge, Silbenauslaut und Tonzeichen. Genau davor
 * warnt der Kommentar in `constants/tones.ts` seit Phase 0: „the tone mark
 * alone does not determine the tone".
 *
 * QUELLE UND ABRUFDATUM (Pflicht 1, Muster aus Phase 2 und 7):
 * Englische Wikipedia, Artikel „Thai script", abgerufen am **2026-09-03**
 * ueber die MediaWiki-API (`action=parse&prop=wikitext`) — also der
 * **Rohtext** der Tabellen, nicht eine Zusammenfassung davon. Eine erste
 * Abfrage ueber ein zusammenfassendes Werkzeug lieferte nur 28 der 44
 * Konsonanten und dazu einen Wert, den die Quelle so nicht hergibt; deshalb
 * derselbe Weg wie in Phase 2, wo eine Fliesstext-Zusammenfassung `/kaj˨˩/`
 * faelschlich als „falling" bezeichnete.
 *
 * Die 44 Konsonantenzeilen sind aus dem geparsten Rohtext **erzeugt**, nicht
 * abgetippt. Vokalmuster und Tonregeln sind von Hand uebertragen; die
 * zugehoerigen Quellzeilen stehen jeweils im Kommentar darueber, damit sich
 * jede Angabe gegen die Quelle pruefen laesst.
 *
 * WAS HIER NICHT STEHT: Handschrift und Strichfolge (kein Ziel dieser Phase)
 * und alles, was Silbengrenzen mehrsilbiger Woerter betraefe — AE-8 gilt
 * unveraendert weiter, siehe AE-38.
 */

export const THAI_SCRIPT_SOURCE = {
  title: 'Thai script',
  url: 'https://en.wikipedia.org/wiki/Thai_script',
  api: 'https://en.wikipedia.org/w/api.php?action=parse&page=Thai%20script&prop=wikitext',
  retrieved: '2026-09-03',
} as const;

/**
 * Zweite Quelle, und zwar aus einem Grund: Der Artikel „Thai script" nennt
 * **keine** Liste echter Konsonantenverbindungen. Ohne sie liest eine Analyse
 * jedes Konsonantenpaar als Verbindung — und dann wird ตลาด (dtà-làat, zwei
 * Silben) faelschlich als eine gelesen. Der Fund stammt aus der Gegenprobe
 * gegen den Grundstock, siehe AE-38.
 */
export const THAI_LANGUAGE_SOURCE = {
  title: 'Thai language',
  section: 'Syllable structure and consonant clusters',
  url: 'https://en.wikipedia.org/wiki/Thai_language',
  retrieved: '2026-09-03',
} as const;

/**
 * Die echten Konsonantenverbindungen des Kernwortschatzes.
 *
 * Wortlaut der Quelle: „In the core vocabulary (i.e. excluding loanwords),
 * only clusters of two consonants occur, of which there are 11 combinations"
 * — /kr/ (กร), /kl/ (กล), /kw/ (กว), /kʰr/ (ขร, คร), /kʰl/ (ขล, คล),
 * /kʰw/ (ขว, คว), /pr/ (ปร), /pl/ (ปล), /pʰr/ (พร), /pʰl/ (ผล, พล),
 * /tr/ (ตร).
 *
 * Elf Lautverbindungen, geschrieben mit den fuenfzehn Paaren hier. Die Liste
 * ist **abschliessend gemeint**: Ein Paar, das nicht darinsteht, ist keine
 * Verbindung, sondern zwei Silben oder ein Leitkonsonant. Genau daran
 * scheitert ตลาด richtig, weil ตล fehlt.
 *
 * Die Quelle nennt zusaetzlich Verbindungen in Lehnwoertern (ทร, ฟร). Sie
 * stehen hier bewusst **nicht**: Der Grundstock braucht sie nicht, und eine
 * offene Liste haette denselben Fehler wie gar keine.
 */
export const CONSONANT_CLUSTERS: { written: string; ipa: string }[] = [
  { written: 'กร', ipa: '/kr/' },
  { written: 'กล', ipa: '/kl/' },
  { written: 'กว', ipa: '/kw/' },
  { written: 'ขร', ipa: '/kʰr/' },
  { written: 'คร', ipa: '/kʰr/' },
  { written: 'ขล', ipa: '/kʰl/' },
  { written: 'คล', ipa: '/kʰl/' },
  { written: 'ขว', ipa: '/kʰw/' },
  { written: 'คว', ipa: '/kʰw/' },
  { written: 'ปร', ipa: '/pr/' },
  { written: 'ปล', ipa: '/pl/' },
  { written: 'พร', ipa: '/pʰr/' },
  { written: 'ผล', ipa: '/pʰl/' },
  { written: 'พล', ipa: '/pʰl/' },
  { written: 'ตร', ipa: '/tr/' },
];

export const CLUSTER_BY_SPELLING: Record<string, { written: string; ipa: string }> =
  Object.fromEntries(CONSONANT_CLUSTERS.map((cluster) => [cluster.written, cluster]));

/* ------------------------------------------------------------------ *
 * Konsonanten                                                         *
 * ------------------------------------------------------------------ */

/**
 * Die drei Konsonantenklassen. Sie sind der wichtigste Eingang in die
 * Tonregel — dieselbe Schreibung ergibt je nach Klasse einen anderen Ton.
 */
export type ConsonantClass = 'mid' | 'high' | 'low';

export const CONSONANT_CLASS_LABEL: Record<ConsonantClass, string> = {
  mid: 'Mittelklasse',
  high: 'Hochklasse',
  low: 'Tiefklasse',
};

/**
 * Wie ein Konsonant am **Silbenende** klingt — und damit, ob die Silbe
 * „lebend" oder „tot" ist. Abgeleitet aus der IPA-Spalte „Final" der Quelle,
 * nicht aus dem Gedaechtnis: Sonorant sind dort /ŋ/, /n/, /m/, /j/, /w/,
 * Plosiv sind /k/, /t/, /p/. `null` heisst: steht in der Quelle als „–",
 * dieser Buchstabe kommt am Silbenende nicht vor.
 */
export type FinalKind = 'sonorant' | 'plosive';

export type ThaiConsonant = {
  symbol: string;
  /** Akrophonischer Name, z. B. „ก ไก่". */
  name: string;
  nameRtgs: string;
  /** Bedeutung des Merkworts — ENGLISCH (Quelle); deutsch: CONSONANT_MEANING_DE. */
  meaning: string;
  consonantClass: ConsonantClass;
  initialIpa: string;
  finalIpa: string | null;
  finalKind: FinalKind | null;
  /** Gesetzt, wenn die Quelle an dieser Stelle mehrdeutig ist. */
  uncertainNote?: string;
};

/**
 * Alle 44 Konsonanten mit Klasse, Anfangs- und Schlusslaut.
 *
 * Erzeugt aus dem Rohtext der Quelltabelle (Abschnitt „Alphabetic").
 * Verteilung zur Kontrolle: 9 Mittelklasse, 11 Hochklasse, 24 Tiefklasse —
 * ein Test rechnet das nach.
 */
export const THAI_CONSONANTS: ThaiConsonant[] = [
  { symbol: 'ก', name: 'ก ไก่', nameRtgs: 'ko kai', meaning: 'chicken', consonantClass: 'mid', initialIpa: '/k/', finalIpa: '/k/', finalKind: 'plosive' },
  { symbol: 'ข', name: 'ข ไข่', nameRtgs: 'kho khai', meaning: 'egg', consonantClass: 'high', initialIpa: '/kʰ/', finalIpa: '/k/', finalKind: 'plosive' },
  { symbol: 'ฃ', name: 'ฃ ขวด', nameRtgs: 'kho khuat', meaning: 'bottle (obsolete)', consonantClass: 'high', initialIpa: '/kʰ/', finalIpa: null, finalKind: null },
  { symbol: 'ค', name: 'ค ควาย', nameRtgs: 'kho khwai', meaning: 'water buffalo', consonantClass: 'low', initialIpa: '/kʰ/', finalIpa: '/k/', finalKind: 'plosive' },
  { symbol: 'ฅ', name: 'ฅ คน', nameRtgs: 'kho khon', meaning: 'human, person (obsolete)', consonantClass: 'low', initialIpa: '/kʰ/', finalIpa: null, finalKind: null },
  { symbol: 'ฆ', name: 'ฆ ระฆัง', nameRtgs: 'kho rakhang', meaning: 'bell', consonantClass: 'low', initialIpa: '/kʰ/', finalIpa: '/k/', finalKind: 'plosive' },
  { symbol: 'ง', name: 'ง งู', nameRtgs: 'ngo ngu', meaning: 'snake', consonantClass: 'low', initialIpa: '/ŋ/', finalIpa: '/ŋ/', finalKind: 'sonorant' },
  { symbol: 'จ', name: 'จ จาน', nameRtgs: 'cho chan', meaning: 'plate', consonantClass: 'mid', initialIpa: '/tɕ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฉ', name: 'ฉ ฉิ่ง', nameRtgs: 'cho ching', meaning: 'ching', consonantClass: 'high', initialIpa: '/tɕʰ/', finalIpa: null, finalKind: null },
  { symbol: 'ช', name: 'ช ช้าง', nameRtgs: 'cho chang', meaning: 'elephant', consonantClass: 'low', initialIpa: '/tɕʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ซ', name: 'ซ โซ่', nameRtgs: 'so so', meaning: 'chain', consonantClass: 'low', initialIpa: '/s/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฌ', name: 'ฌ เฌอ', nameRtgs: 'cho choe', meaning: 'tree', consonantClass: 'low', initialIpa: '/tɕʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ญ', name: 'ญ หญิง', nameRtgs: 'yo ying', meaning: 'woman', consonantClass: 'low', initialIpa: '/j/', finalIpa: '/n/', finalKind: 'sonorant' },
  { symbol: 'ฎ', name: 'ฎ ชฎา', nameRtgs: 'do chada', meaning: 'makuṭa', consonantClass: 'mid', initialIpa: '/d/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฏ', name: 'ฏ ปฏัก', nameRtgs: 'to patak', meaning: 'goad, javelin, spear', consonantClass: 'mid', initialIpa: '/t/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฐ', name: 'ฐ ฐาน', nameRtgs: 'tho than', meaning: 'pedestal', consonantClass: 'high', initialIpa: '/tʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฑ', name: 'ฑ มณโฑ', nameRtgs: 'tho montho', meaning: 'Montho', consonantClass: 'low', initialIpa: '/tʰ/ or /d/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ฒ', name: 'ฒ ผู้เฒ่า', nameRtgs: 'tho phu thao', meaning: 'elder', consonantClass: 'low', initialIpa: '/tʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ณ', name: 'ณ เณร', nameRtgs: 'no nen', meaning: 'samanera', consonantClass: 'low', initialIpa: '/n/', finalIpa: '/n/', finalKind: 'sonorant' },
  { symbol: 'ด', name: 'ด เด็ก', nameRtgs: 'do dek', meaning: 'child', consonantClass: 'mid', initialIpa: '/d/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ต', name: 'ต เต่า', nameRtgs: 'to tao', meaning: 'turtle', consonantClass: 'mid', initialIpa: '/t/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ถ', name: 'ถ ถุง', nameRtgs: 'tho thung', meaning: 'sack', consonantClass: 'high', initialIpa: '/tʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ท', name: 'ท ทหาร', nameRtgs: 'tho thahan', meaning: 'soldier', consonantClass: 'low', initialIpa: '/tʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ธ', name: 'ธ ธง', nameRtgs: 'tho thong', meaning: 'flag', consonantClass: 'low', initialIpa: '/tʰ/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'น', name: 'น หนู', nameRtgs: 'no nu', meaning: 'mouse, rat', consonantClass: 'low', initialIpa: '/n/', finalIpa: '/n/', finalKind: 'sonorant' },
  { symbol: 'บ', name: 'บ ใบไม้', nameRtgs: 'bo baimai', meaning: 'leaf', consonantClass: 'mid', initialIpa: '/b/', finalIpa: '/p/', finalKind: 'plosive' },
  { symbol: 'ป', name: 'ป ปลา', nameRtgs: 'po pla', meaning: 'fish', consonantClass: 'mid', initialIpa: '/p/', finalIpa: '/p/', finalKind: 'plosive' },
  { symbol: 'ผ', name: 'ผ ผึ้ง', nameRtgs: 'pho phueng', meaning: 'bee', consonantClass: 'high', initialIpa: '/pʰ/', finalIpa: null, finalKind: null },
  { symbol: 'ฝ', name: 'ฝ ฝา', nameRtgs: 'fo fa', meaning: 'lid', consonantClass: 'high', initialIpa: '/f/', finalIpa: null, finalKind: null },
  { symbol: 'พ', name: 'พ พาน', nameRtgs: 'pho phan', meaning: 'phan', consonantClass: 'low', initialIpa: '/pʰ/', finalIpa: '/p/', finalKind: 'plosive' },
  { symbol: 'ฟ', name: 'ฟ ฟัน', nameRtgs: 'fo fan', meaning: 'tooth', consonantClass: 'low', initialIpa: '/f/', finalIpa: '/p/', finalKind: 'plosive' },
  { symbol: 'ภ', name: 'ภ สำเภา', nameRtgs: 'pho samphao', meaning: 'junk', consonantClass: 'low', initialIpa: '/pʰ/', finalIpa: '/p/', finalKind: 'plosive' },
  { symbol: 'ม', name: 'ม ม้า', nameRtgs: 'mo ma', meaning: 'horse', consonantClass: 'low', initialIpa: '/m/', finalIpa: '/m/', finalKind: 'sonorant' },
  { symbol: 'ย', name: 'ย ยักษ์', nameRtgs: 'yo yak', meaning: 'giant, yaksha', consonantClass: 'low', initialIpa: '/j/', finalIpa: '/j/', finalKind: 'sonorant' },
  { symbol: 'ร', name: 'ร เรือ', nameRtgs: 'ro ruea', meaning: 'boat, ship', consonantClass: 'low', initialIpa: '/r/', finalIpa: '/n/', finalKind: 'sonorant' },
  { symbol: 'ล', name: 'ล ลิง', nameRtgs: 'lo ling', meaning: 'monkey', consonantClass: 'low', initialIpa: '/l/', finalIpa: '/n/ or /w/', finalKind: 'sonorant', uncertainNote:
      'Die Quelle nennt fuer den Schlusslaut \'/n/ or /w/\' - zwei Moeglichkeiten. Hier als Sonorant gefuehrt (lebende Silbe); der zweite Wert waere ebenfalls ein Sonorant, das Ergebnis der Tonregel aendert sich dadurch nicht.' },
  { symbol: 'ว', name: 'ว แหวน', nameRtgs: 'wo waen', meaning: 'ring', consonantClass: 'low', initialIpa: '/w/', finalIpa: '/w/', finalKind: 'sonorant' },
  { symbol: 'ศ', name: 'ศ ศาลา', nameRtgs: 'so sala', meaning: 'pavilion, sala', consonantClass: 'high', initialIpa: '/s/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ษ', name: 'ษ ฤๅษี', nameRtgs: 'so ruesi', meaning: 'rishi', consonantClass: 'high', initialIpa: '/s/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ส', name: 'ส เสือ', nameRtgs: 'so suea', meaning: 'tiger, big cat', consonantClass: 'high', initialIpa: '/s/', finalIpa: '/t/', finalKind: 'plosive' },
  { symbol: 'ห', name: 'ห หีบ', nameRtgs: 'ho hip', meaning: 'chest, box', consonantClass: 'high', initialIpa: '/h/', finalIpa: null, finalKind: null },
  { symbol: 'ฬ', name: 'ฬ จุฬา', nameRtgs: 'lo chula', meaning: 'chula kite', consonantClass: 'low', initialIpa: '/l/', finalIpa: '/n/', finalKind: 'sonorant' },
  { symbol: 'อ', name: 'อ อ่าง', nameRtgs: 'o ang', meaning: 'basin, tub', consonantClass: 'mid', initialIpa: '/ʔ/', finalIpa: null, finalKind: null },
  { symbol: 'ฮ', name: 'ฮ นกฮูก', nameRtgs: 'ho nok huk', meaning: 'owl', consonantClass: 'low', initialIpa: '/h/', finalIpa: null, finalKind: null },
];

export const CONSONANT_BY_SYMBOL: Record<string, ThaiConsonant> = Object.fromEntries(
  THAI_CONSONANTS.map((consonant) => [consonant.symbol, consonant])
);

/* ------------------------------------------------------------------ *
 * Tonzeichen                                                          *
 * ------------------------------------------------------------------ */

/**
 * Die vier Tonzeichen. Aus der Quelle: „one of four tone marks, whose names
 * derive from the names of the digits 1–4 borrowed from Pali or Sanskrit".
 */
export const TONE_MARKS = {
  '\u0e48': { symbol: '\u0e48', name: '\u0e44\u0e21\u0e49\u0e40\u0e2d\u0e01', nameRtgs: 'mai ek' },
  '\u0e49': { symbol: '\u0e49', name: '\u0e44\u0e21\u0e49\u0e42\u0e17', nameRtgs: 'mai tho' },
  '\u0e4a': { symbol: '\u0e4a', name: '\u0e44\u0e21\u0e49\u0e15\u0e23\u0e35', nameRtgs: 'mai tri' },
  '\u0e4b': { symbol: '\u0e4b', name: '\u0e44\u0e21\u0e49\u0e08\u0e31\u0e15\u0e27\u0e32', nameRtgs: 'mai chattawa' },
} as const;

export type ToneMark = keyof typeof TONE_MARKS;

export const TONE_MARK_KEYS = Object.keys(TONE_MARKS) as ToneMark[];

export function isToneMark(character: string): character is ToneMark {
  return character in TONE_MARKS;
}

/* ------------------------------------------------------------------ *
 * Silbenart                                                           *
 * ------------------------------------------------------------------ */

/**
 * Wortlaut der Quelle:
 *   live       — „long vowel or vowel plus sonorant"
 *   dead short — „short vowel at end or plus plosive"
 *   dead long  — „long vowel plus plosive"
 */
export type SyllableShape = 'live' | 'dead-short' | 'dead-long';

/* ------------------------------------------------------------------ *
 * Die Tonregeln                                                       *
 * ------------------------------------------------------------------ */

/**
 * Die Tonregeltabelle, Zeile fuer Zeile aus der Quelle.
 *
 * Ohne Tonzeichen entscheidet die Silbenart, mit Tonzeichen das Zeichen —
 * beides zusammen mit der Konsonantenklasse. `null` heisst: diese Kombination
 * gibt es nicht. Die Quelle dazu ausdruecklich: „Mai tri and mai chattawa are
 * only used with mid-class consonants."
 *
 * | Zeichen        | Silbenart  | tief    | mittel  | hoch    |
 * | -------------- | ---------- | ------- | ------- | ------- |
 * | (keins)        | lebend     | middle  | middle  | rising  |
 * | (keins)        | tot, kurz  | high    | low     | low     |
 * | (keins)        | tot, lang  | falling | low     | low     |
 * | mai ek         | beliebig   | falling | low     | low     |
 * | mai tho        | beliebig   | high    | falling | falling |
 * | mai tri        | beliebig   | –       | high    | –       |
 * | mai chattawa   | beliebig   | –       | rising  | –       |
 */
export const TONE_RULES: {
  unmarked: Record<SyllableShape, Record<ConsonantClass, Tone>>;
  marked: Record<ToneMark, Record<ConsonantClass, Tone | null>>;
} = {
  unmarked: {
    live: { low: 'mid', mid: 'mid', high: 'rising' },
    'dead-short': { low: 'high', mid: 'low', high: 'low' },
    'dead-long': { low: 'falling', mid: 'low', high: 'low' },
  },
  marked: {
    '\u0e48': { low: 'falling', mid: 'low', high: 'low' },
    '\u0e49': { low: 'high', mid: 'falling', high: 'falling' },
    '\u0e4a': { low: null, mid: 'high', high: null },
    '\u0e4b': { low: null, mid: 'rising', high: null },
  },
};

/* ------------------------------------------------------------------ *
 * Leitkonsonanten                                                     *
 * ------------------------------------------------------------------ */

/**
 * ห นำ („leading ho"). Wortlaut der Quelle: „A silent, high-class ห ‚leads‘
 * low-class nasal stops (ง, ญ, น and ม) and non-plosives (ว, ย, ร and ล),
 * which have no corresponding high-class phonetic match, into the tone
 * properties of a high-class consonant."
 *
 * Ohne diese Regel waere หมา (mǎa, steigend) nicht herleitbar: ม allein ist
 * Tiefklasse und ergaebe „mittel".
 */
export const HO_NAM_FOLLOWERS = [
  '\u0e07', '\u0e0d', '\u0e19', '\u0e21', '\u0e27', '\u0e22', '\u0e23', '\u0e25',
] as const;

/**
 * อ นำ („leading o"). Die Quelle nennt es ausdruecklich abschliessend:
 * „In four words only, a silent, mid-class อ ‚leads‘ low-class ย into
 * mid-class tone rules: อย่า, อยาก, อย่าง, อยู่."
 *
 * Deshalb hier eine Liste dieser vier Woerter und keine Regel — eine Regel
 * wuerde auf Woerter zutreffen, fuer die die Quelle sie nicht behauptet.
 */
export const O_NAM_WORDS = ['\u0e2d\u0e22\u0e48\u0e32', '\u0e2d\u0e22\u0e32\u0e01', '\u0e2d\u0e22\u0e48\u0e32\u0e07', '\u0e2d\u0e22\u0e39\u0e48'] as const;

/* ------------------------------------------------------------------ *
 * Vokalmuster                                                         *
 * ------------------------------------------------------------------ */

/**
 * Die Vokalmuster mit ihrer Laenge, aus der Tabelle „Short vowels / Long
 * vowels" der Quelle.
 *
 * SCHREIBWEISE: `prefix` steht **vor** dem Anfangskonsonanten, `infix`
 * dazwischen und dem Schlusskonsonanten, `suffix` dahinter. `final` sagt, ob
 * das Muster einen Schlusskonsonanten verlangt (`required`), keinen zulaesst
 * (`none`) oder beides erlaubt (`optional`) — die Quelle listet dafuer
 * jeweils zwei Formen, etwa „◌า" und „◌า◌".
 *
 * `endsInSonorant` markiert die Muster, die selbst auf einen Halbvokal
 * enden (เ◌า /aw/, ไ◌ /aj/, ◌ำ /am/ …). Sie sind **lebend**, obwohl sie kurz
 * sind — die Quelle zaehlt sie unter „vowel plus sonorant". Ohne diese
 * Unterscheidung wuerde ไป (bpai, mittel) als tote Silbe gelesen.
 */
export type VowelLength = 'short' | 'long';

export type VowelPattern = {
  /** Wie die Quelle das Muster schreibt, z. B. „เ◌ีย◌". */
  display: string;
  prefix: string;
  infix: string;
  suffix: string;
  final: 'required' | 'none' | 'optional';
  length: VowelLength;
  /** Das Muster endet selbst auf einen Halbvokal → lebende Silbe. */
  endsInSonorant?: true;
  ipa: string;
  rtgs: string;
};

/**
 * Reihenfolge ist bedeutsam: Es wird von oben nach unten geprueft, und
 * laengere Muster muessen vor ihren kuerzeren Anfaengen stehen. Sonst
 * verschlaenge „เ◌" (langes /eː/) den Anfang von „เ◌ีย◌".
 */
export const VOWEL_PATTERNS: VowelPattern[] = [
  { display: 'เ◌ียว', prefix: 'เ', infix: 'ียว', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/iaw/', rtgs: 'iao' },
  { display: 'เ◌ือย', prefix: 'เ', infix: 'ือย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/ɯaj/', rtgs: 'ueai' },
  { display: 'เ◌ียะ', prefix: 'เ', infix: 'ียะ', suffix: '', final: 'none', length: 'short', ipa: '/iaʔ/', rtgs: 'ia' },
  { display: 'เ◌ือะ', prefix: 'เ', infix: 'ือะ', suffix: '', final: 'none', length: 'short', ipa: '/ɯaʔ/', rtgs: 'uea' },
  { display: 'เ◌ีย◌', prefix: 'เ', infix: 'ีย', suffix: '', final: 'required', length: 'long', ipa: '/ia/', rtgs: 'ia' },
  { display: 'เ◌ีย', prefix: 'เ', infix: 'ีย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/ia/', rtgs: 'ia' },
  { display: 'เ◌ือ◌', prefix: 'เ', infix: 'ือ', suffix: '', final: 'required', length: 'long', ipa: '/ɯa/', rtgs: 'uea' },
  { display: 'เ◌ือ', prefix: 'เ', infix: 'ือ', suffix: '', final: 'none', length: 'long', ipa: '/ɯa/', rtgs: 'uea' },
  { display: '◌ัวะ', prefix: '', infix: 'ัวะ', suffix: '', final: 'none', length: 'short', ipa: '/uaʔ/', rtgs: 'ua' },
  { display: '◌ัว', prefix: '', infix: 'ัว', suffix: '', final: 'none', length: 'long', ipa: '/ua/', rtgs: 'ua' },
  { display: '◌วย', prefix: '', infix: 'วย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/uaj/', rtgs: 'uai' },
  { display: '◌ว◌', prefix: '', infix: 'ว', suffix: '', final: 'required', length: 'long', ipa: '/ua/', rtgs: 'ua' },
  { display: 'เ◌อะ', prefix: 'เ', infix: 'อะ', suffix: '', final: 'none', length: 'short', ipa: '/ɤʔ/', rtgs: 'oe' },
  { display: 'เ◌อ◌', prefix: 'เ', infix: 'อ', suffix: '', final: 'required', length: 'long', ipa: '/ɤː/', rtgs: 'oe' },
  { display: 'เ◌อ', prefix: 'เ', infix: 'อ', suffix: '', final: 'none', length: 'long', ipa: '/ɤː/', rtgs: 'oe' },
  { display: 'เ◌ิ◌', prefix: 'เ', infix: 'ิ', suffix: '', final: 'required', length: 'long', ipa: '/ɤː/', rtgs: 'oe' },
  { display: 'เ◌ย', prefix: 'เ', infix: 'ย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/ɤːj/', rtgs: 'oei' },
  { display: 'เ◌าะ', prefix: 'เ', infix: 'าะ', suffix: '', final: 'none', length: 'short', ipa: '/ɔʔ/', rtgs: 'o' },
  { display: 'เ◌า', prefix: 'เ', infix: 'า', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/aw/', rtgs: 'ao' },
  { display: 'เ◌็ว', prefix: 'เ', infix: '็ว', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/ew/', rtgs: 'eo' },
  { display: 'เ◌ว', prefix: 'เ', infix: 'ว', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/eːw/', rtgs: 'eo' },
  { display: 'เ◌็◌', prefix: 'เ', infix: '็', suffix: '', final: 'required', length: 'short', ipa: '/e/', rtgs: 'e' },
  { display: 'เ◌ะ', prefix: 'เ', infix: 'ะ', suffix: '', final: 'none', length: 'short', ipa: '/eʔ/', rtgs: 'e' },
  { display: 'เ◌◌', prefix: 'เ', infix: '', suffix: '', final: 'required', length: 'long', ipa: '/eː/', rtgs: 'e' },
  { display: 'เ◌', prefix: 'เ', infix: '', suffix: '', final: 'none', length: 'long', ipa: '/eː/', rtgs: 'e' },
  { display: 'แ◌ว', prefix: 'แ', infix: 'ว', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/ɛːw/', rtgs: 'aeo' },
  { display: 'แ◌็◌', prefix: 'แ', infix: '็', suffix: '', final: 'required', length: 'short', ipa: '/ɛ/', rtgs: 'ae' },
  { display: 'แ◌ะ', prefix: 'แ', infix: 'ะ', suffix: '', final: 'none', length: 'short', ipa: '/ɛʔ/', rtgs: 'ae' },
  { display: 'แ◌◌', prefix: 'แ', infix: '', suffix: '', final: 'required', length: 'long', ipa: '/ɛː/', rtgs: 'ae' },
  { display: 'แ◌', prefix: 'แ', infix: '', suffix: '', final: 'none', length: 'long', ipa: '/ɛː/', rtgs: 'ae' },
  { display: 'โ◌ย', prefix: 'โ', infix: 'ย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/oːj/', rtgs: 'oi' },
  { display: 'โ◌ะ', prefix: 'โ', infix: 'ะ', suffix: '', final: 'none', length: 'short', ipa: '/oʔ/', rtgs: 'o' },
  { display: 'โ◌◌', prefix: 'โ', infix: '', suffix: '', final: 'required', length: 'long', ipa: '/oː/', rtgs: 'o' },
  { display: 'โ◌', prefix: 'โ', infix: '', suffix: '', final: 'none', length: 'long', ipa: '/oː/', rtgs: 'o' },
  { display: '◌็อย', prefix: '', infix: '็อย', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/ɔj/', rtgs: 'oi' },
  { display: '◌็อ◌', prefix: '', infix: '็อ', suffix: '', final: 'required', length: 'short', ipa: '/ɔ/', rtgs: 'o' },
  { display: '◌อย', prefix: '', infix: 'อย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/ɔːj/', rtgs: 'oi' },
  { display: '◌อ◌', prefix: '', infix: 'อ', suffix: '', final: 'required', length: 'long', ipa: '/ɔː/', rtgs: 'o' },
  { display: '◌อ', prefix: '', infix: 'อ', suffix: '', final: 'none', length: 'long', ipa: '/ɔː/', rtgs: 'o' },
  { display: '◌าว', prefix: '', infix: 'าว', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/aːw/', rtgs: 'ao' },
  { display: '◌าย', prefix: '', infix: 'าย', suffix: '', final: 'none', length: 'long', endsInSonorant: true, ipa: '/aːj/', rtgs: 'ai' },
  { display: '◌า◌', prefix: '', infix: 'า', suffix: '', final: 'required', length: 'long', ipa: '/aː/', rtgs: 'a' },
  { display: '◌า', prefix: '', infix: 'า', suffix: '', final: 'none', length: 'long', ipa: '/aː/', rtgs: 'a' },
  { display: '◌ำ', prefix: '', infix: 'ำ', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/am/', rtgs: 'am' },
  { display: '◌ัย', prefix: '', infix: 'ัย', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/aj/', rtgs: 'ai' },
  { display: '◌ั◌', prefix: '', infix: 'ั', suffix: '', final: 'required', length: 'short', ipa: '/a/', rtgs: 'a' },
  { display: '◌ะ', prefix: '', infix: 'ะ', suffix: '', final: 'none', length: 'short', ipa: '/aʔ/', rtgs: 'a' },
  { display: '◌ิว', prefix: '', infix: 'ิว', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/iw/', rtgs: 'io' },
  { display: '◌ิ◌', prefix: '', infix: 'ิ', suffix: '', final: 'optional', length: 'short', ipa: '/i/', rtgs: 'i' },
  { display: '◌ี◌', prefix: '', infix: 'ี', suffix: '', final: 'optional', length: 'long', ipa: '/iː/', rtgs: 'i' },
  { display: '◌ือ', prefix: '', infix: 'ือ', suffix: '', final: 'none', length: 'long', ipa: '/ɯː/', rtgs: 'ue' },
  { display: '◌ื◌', prefix: '', infix: 'ื', suffix: '', final: 'required', length: 'long', ipa: '/ɯː/', rtgs: 'ue' },
  { display: '◌ึ◌', prefix: '', infix: 'ึ', suffix: '', final: 'optional', length: 'short', ipa: '/ɯ/', rtgs: 'ue' },
  { display: '◌ุย', prefix: '', infix: 'ุย', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/uj/', rtgs: 'ui' },
  { display: '◌ุ◌', prefix: '', infix: 'ุ', suffix: '', final: 'optional', length: 'short', ipa: '/u/', rtgs: 'u' },
  { display: '◌ู◌', prefix: '', infix: 'ู', suffix: '', final: 'optional', length: 'long', ipa: '/uː/', rtgs: 'u' },
  { display: 'ไ◌ย', prefix: 'ไ', infix: 'ย', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/aj/', rtgs: 'ai' },
  { display: 'ไ◌', prefix: 'ไ', infix: '', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/aj/', rtgs: 'ai' },
  { display: 'ใ◌', prefix: 'ใ', infix: '', suffix: '', final: 'none', length: 'short', endsInSonorant: true, ipa: '/aj/', rtgs: 'ai' },
];

/**
 * Der **implizite** Vokal: zwei Konsonanten ohne Vokalzeichen dazwischen.
 *
 * Die Quelle fuehrt ihn in der Tabelle als „◌◌" in der Zeile von „โ◌ะ"
 * (kurzes /o/). Er steht bewusst NICHT in `VOWEL_PATTERNS`, sondern wird
 * zuletzt geprueft: Er passt auf fast alles und wuerde sonst echte Muster
 * verdraengen. คน (kon) und รถ (rót) sind die Faelle im Grundstock.
 *
 * Die Quelle nennt in einer Fussnote („orn") auch ein implizites langes /ɔː/
 * fuer dieselbe Schreibung. Welche der beiden Lesarten gilt, ist der Schrift
 * nicht anzusehen — deshalb meldet die Analyse hier eine benannte
 * Unsicherheit, statt sich fuer eine zu entscheiden.
 */
export const IMPLICIT_VOWEL = {
  display: '\u0e42\u25cc\u0e30 (\u25cc\u25cc)',
  length: 'short' as VowelLength,
  ipa: '/o/',
  rtgs: 'o',
  ambiguityNote:
    'Zwei Konsonanten ohne Vokalzeichen: gelesen als kurzes /o/. Die Quelle kennt fuer dieselbe Schreibung auch ein langes /ɔː/; welche Lesart gilt, steht nicht in der Schrift.',
} as const;

/**
 * Deutsche Bedeutung der Merkwörter (zu `meaning`, das englisch aus der
 * Quelle stammt). Die Konsonantenklassen-Übung zeigte auf der deutschen
 * Oberfläche sonst „owl“ statt „Eule“ (Release-Prüfung 23.09.2026).
 */
export const CONSONANT_MEANING_DE: Record<string, string> = {
  'ก': 'Huhn', 'ข': 'Ei', 'ฃ': 'Flasche (veraltet)', 'ค': 'Wasserbüffel',
  'ฅ': 'Mensch (veraltet)', 'ฆ': 'Glocke', 'ง': 'Schlange', 'จ': 'Teller',
  'ฉ': 'Ching (Zimbel)', 'ช': 'Elefant', 'ซ': 'Kette', 'ฌ': 'Baum',
  'ญ': 'Frau', 'ฎ': 'Krone (Chada)', 'ฏ': 'Speer', 'ฐ': 'Sockel',
  'ฑ': 'Montho (Figur aus dem Ramakien)', 'ฒ': 'alter Mensch', 'ณ': 'Novize',
  'ด': 'Kind', 'ต': 'Schildkröte', 'ถ': 'Sack', 'ท': 'Soldat', 'ธ': 'Fahne',
  'น': 'Maus', 'บ': 'Blatt', 'ป': 'Fisch', 'ผ': 'Biene', 'ฝ': 'Deckel',
  'พ': 'Schale auf Fuß (Phan)', 'ฟ': 'Zahn', 'ภ': 'Dschunke', 'ม': 'Pferd',
  'ย': 'Riese (Yak)', 'ร': 'Boot', 'ล': 'Affe', 'ว': 'Ring', 'ศ': 'Pavillon (Sala)',
  'ษ': 'Einsiedler (Rishi)', 'ส': 'Tiger', 'ห': 'Truhe', 'ฬ': 'Drachen (Chula)',
  'อ': 'Schüssel', 'ฮ': 'Eule',
};
