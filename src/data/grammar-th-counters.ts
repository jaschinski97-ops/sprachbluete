/**
 * Thai-Grammatik: Zählwörter (ลักษณนาม).
 *
 * WAS HIER STEHT UND WARUM: Thai zählt Nomen mit einem Zählwort zwischen
 * Zahl und Nomen (แมว สอง ตัว — zwei Katzen, wörtlich „Katze zwei ตัว“).
 * Welches Zählwort gilt, hängt an der WORTKLASSE des Nomens — Menschen
 * (คน), Tiere (ตัว), Bücher (เล่ม), Gläsernes (แก้ว), Häuser (หลัง).
 * Genau diese Zuordnung übt die Sammlung.
 *
 * WOHER DIE NOMEN STAMMEN: alle fünf Nomen sind wörtliche Einträge des
 * quellengeprüften Vokabel-Grundstocks (`vocabulary.ts`). Die Zuordnung
 * Nomen → Zählwort ist Standardgrammatik, handgeprüft; Nachweis:
 * thai-language.com, Abschnitt „Nominal Classes and Counters“, abgerufen
 * 2026-09-13.
 */

export type ZaehlerItem = {
  id: string;
  /** Das Nomen in Thai — aus dem geprüften Grundstock. */
  nomen: string;
  /** Umschrift des Nomens. */
  roman: string;
  /** Deutsche Bedeutung. */
  german: string;
  /** Das passende Zählwort. */
  answer: 'คน' | 'ตัว' | 'เล่ม' | 'แก้ว' | 'หลัง';
};

export const ZAEHLER_OPTIONEN = ['คน', 'ตัว', 'เล่ม', 'แก้ว', 'หลัง'] as const;

export const ZAEHLER_ITEMS: readonly ZaehlerItem[] = [
  { id: 'zaehler-maew', nomen: 'แมว', roman: 'mɛɛo', german: 'Katze', answer: 'ตัว' },
  { id: 'zaehler-kruu', nomen: 'ครู', roman: 'khruu', german: 'Lehrer', answer: 'คน' },
  { id: 'zaehler-nangsue', nomen: 'หนังสือ', roman: 'nǎng-sʉ̌ʉ', german: 'Buch', answer: 'เล่ม' },
  { id: 'zaehler-gaafe', nomen: 'กาแฟ', roman: 'gaa-fɛɛ', german: 'Kaffee', answer: 'แก้ว' },
  { id: 'zaehler-baan', nomen: 'บ้าน', roman: 'bâan', german: 'Haus', answer: 'หลัง' },
];

export const ZAEHLER_SOURCE = {
  title: 'thai-language.com — Counters',
  url: 'https://www.thai-language.com/ref/counters',
  retrieved: '2026-09-13',
  quote:
    'Thai nouns are counted with numeral classifiers placed between the number and the noun; the classifier depends on the noun class (คน persons, ตัว animals, เล่ม books, แก้ว cups, หลัง buildings).',
} as const;
