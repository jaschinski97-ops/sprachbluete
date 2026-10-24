import type { Tone } from '@/constants/tones';
import type { ToneWort } from '@/lib/content/tone-gate';

/**
 * Fester Kalibriersatz für Thai-Hörclips (24.10.2026).
 *
 * WOFÜR: Vor dem großen Lauf erzeugt der Nutzer im Studio diesen Satz mit
 * 1–3 Gemini-Stimmen. Das Ton-Gate misst die Clips, der Bericht empfiehlt
 * eine Stimme und legt deren Stimmlage als Sprecher-Referenz ab. Die Clips
 * kommen NICHT in den Katalog.
 *
 * NICHT PER KI: Töne aus den Thai-Tonregeln (Konsonantenklasse, Tonzeichen,
 * lebende/tote Silbe, Vokallänge), Umschrift im Paiboon-Stil wie im Katalog.
 * Bei Einsilbern leitet `tone-calibration-words.test.ts` den Ton zusätzlich
 * aus der Schrift ab und vergleicht ihn mit dem eingetragenen.
 *
 * AUFBAU: je Ton 9–10 Einsilber (lebend/tot, kurz/lang), Minimalgruppen
 * (ไก่/ไข่, ใกล้/ไกล, มา/ม้า/หมา, ไม่/ใหม่/ไม้/ไหม, ข่าว/ข้าว/ขาว,
 * เสื่อ/เสื้อ/เสือ, ปา/ป่า/ป้า) und zwölf häufige Zwei- und Dreisilber.
 * Wer etwas ändert, erhöht `KALIBRIER_SATZ_VERSION` — Berichte nennen sie.
 */
export const KALIBRIER_SATZ_VERSION = 'th-kalibrierung-1';

export const KALIBRIER_QUELLEN = [
  {
    title: 'Mary R. Haas: Thai-English Student’s Dictionary (Stanford University Press, 1964) — Einleitung, Tonregeln',
    note: 'Tonregeln nach Konsonantenklasse, Tonzeichen, lebender/toter Silbe und Vokallänge.',
  },
  {
    title: 'R. Baldwin: A Visual Aid for Remembering Thai Tone Rules, Journal of the Siam Society 66 (1978)',
    url: 'https://thesiamsociety.org/wp-content/uploads/1978/03/JSS_066_1k_Baldwin_VisualAidForRememberingThaiToneRules.pdf',
    note: 'Gegenprüfung der Regeltabelle.',
  },
  {
    title: 'Benjawan Poomsan Becker: Thai-English, English-Thai Dictionary (Paiboon Publishing)',
    note: 'Umschrift (Paiboon-Stil, wie im Katalog und in src/lib/content/thai-romanization.test.ts).',
  },
] as const;

export type KalibrierWort = {
  id: string;
  term: string;
  /** Paiboon-Umschrift, Silben mit „-“ getrennt. */
  roman: string;
  /** Kurze englische Bedeutung — nur zur Orientierung im Bericht. */
  bedeutung: string;
  toene: Tone[];
  /** Nur bei Einsilbern: lebende/tote Silbe und gesprochene Vokallänge. */
  silbe?: { lebend: boolean; vokal: 'kurz' | 'lang' };
  /** Minimalgruppe, deren Glieder sich nur im Ton (bzw. ไก่/ไข่: Anlaut) unterscheiden. */
  gruppe?: string;
};

type Zeile = [term: string, roman: string, bedeutung: string, toene: Tone[], silbe?: KalibrierWort['silbe'], gruppe?: string];

const L = (vokal: 'kurz' | 'lang') => ({ lebend: true, vokal });
const T = (vokal: 'kurz' | 'lang') => ({ lebend: false, vokal });

const ZEILEN: Zeile[] = [
  // Mittel
  ['มา', 'maa', 'come', ['mid'], L('lang'), 'maa'],
  ['ไกล', 'glai', 'far', ['mid'], L('kurz'), 'glai'],
  ['ปา', 'bpaa', 'throw', ['mid'], L('lang'), 'bpaa'],
  ['กิน', 'gin', 'eat', ['mid'], L('kurz')],
  ['ดี', 'dii', 'good', ['mid'], L('lang')],
  ['ปลา', 'bplaa', 'fish', ['mid'], L('lang')],
  ['ใจ', 'jai', 'heart', ['mid'], L('kurz')],
  ['ยาว', 'yaao', 'long', ['mid'], L('lang')],
  ['งาน', 'ngaan', 'work', ['mid'], L('lang')],
  // Tief
  ['ไก่', 'gài', 'chicken', ['low'], L('kurz'), 'gai-khai'],
  ['ไข่', 'khài', 'egg', ['low'], L('kurz'), 'gai-khai'],
  ['ข่าว', 'khàao', 'news', ['low'], L('lang'), 'khaao'],
  ['ใหม่', 'mài', 'new', ['low'], L('kurz'), 'mai'],
  ['ป่า', 'bpàa', 'forest', ['low'], L('lang'), 'bpaa'],
  ['เสื่อ', 'sʉ̀a', 'mat', ['low'], L('lang'), 'sua'],
  ['ปาก', 'bpàak', 'mouth', ['low'], T('lang')],
  ['หก', 'hòk', 'six', ['low'], T('kurz')],
  ['สิบ', 'sìp', 'ten', ['low'], T('kurz')],
  ['กับ', 'gàp', 'with', ['low'], T('kurz')],
  // Fallend
  ['ใกล้', 'glâi', 'near', ['falling'], L('kurz'), 'glai'],
  ['ข้าว', 'khâao', 'rice', ['falling'], L('lang'), 'khaao'],
  ['ไม่', 'mâi', 'not', ['falling'], L('kurz'), 'mai'],
  ['ป้า', 'bpâa', 'aunt', ['falling'], L('lang'), 'bpaa'],
  ['เสื้อ', 'sʉ̂a', 'shirt', ['falling'], L('lang'), 'sua'],
  ['พ่อ', 'phɔ̂ɔ', 'father', ['falling'], L('lang')],
  ['แม่', 'mɛ̂ɛ', 'mother', ['falling'], L('lang')],
  ['บ้าน', 'bâan', 'house', ['falling'], L('lang')],
  ['มาก', 'mâak', 'very', ['falling'], T('lang')],
  ['ชอบ', 'chɔ̂ɔp', 'like', ['falling'], T('lang')],
  // Hoch
  ['ม้า', 'máa', 'horse', ['high'], L('lang'), 'maa'],
  // ไม้: kurz geschrieben, lang gesprochen (Paiboon máai).
  ['ไม้', 'máai', 'wood', ['high'], L('lang'), 'mai'],
  ['รัก', 'rák', 'love', ['high'], T('kurz')],
  ['นก', 'nók', 'bird', ['high'], T('kurz')],
  ['เล็ก', 'lék', 'small', ['high'], T('kurz')],
  ['โต๊ะ', 'dtó', 'table', ['high'], T('kurz')],
  ['ช้าง', 'cháang', 'elephant', ['high'], L('lang')],
  ['ร้อน', 'rɔ́ɔn', 'hot', ['high'], L('lang')],
  ['น้อง', 'nɔ́ɔng', 'younger sibling', ['high'], L('lang')],
  // Steigend
  ['หมา', 'mǎa', 'dog', ['rising'], L('lang'), 'maa'],
  ['ไหม', 'mǎi', 'silk; question particle', ['rising'], L('kurz'), 'mai'],
  ['ขาว', 'khǎao', 'white', ['rising'], L('lang'), 'khaao'],
  ['เสือ', 'sʉ̌a', 'tiger', ['rising'], L('lang'), 'sua'],
  ['ขา', 'khǎa', 'leg', ['rising'], L('lang')],
  ['สอง', 'sɔ̌ɔng', 'two', ['rising'], L('lang')],
  ['หมู', 'mǔu', 'pig', ['rising'], L('lang')],
  ['สวย', 'sǔai', 'beautiful', ['rising'], L('lang')],
  ['ผม', 'phǒm', 'hair; I (male)', ['rising'], L('kurz')],
  ['หู', 'hǔu', 'ear', ['rising'], L('lang')],
  // Zwei- und Dreisilber
  ['สวัสดี', 'sà-wàt-dii', 'hello', ['low', 'low', 'mid']],
  ['ขอบคุณ', 'khɔ̀ɔp-khun', 'thank you', ['low', 'mid']],
  ['อร่อย', 'à-rɔ̀i', 'delicious', ['low', 'low']],
  ['ประเทศ', 'bprà-thêet', 'country', ['low', 'falling']],
  ['ตลาด', 'dtà-làat', 'market', ['low', 'low']],
  ['โทรศัพท์', 'thoo-rá-sàp', 'telephone', ['mid', 'high', 'low']],
  ['หนังสือ', 'nǎng-sʉ̌ʉ', 'book', ['rising', 'rising']],
  ['ภาษาไทย', 'phaa-sǎa-thai', 'Thai language', ['mid', 'rising', 'mid']],
  ['ร้านอาหาร', 'ráan-aa-hǎan', 'restaurant', ['high', 'mid', 'rising']],
  ['ผู้หญิง', 'phûu-yǐng', 'woman', ['falling', 'rising']],
  ['น่ารัก', 'nâa-rák', 'cute', ['falling', 'high']],
  ['พรุ่งนี้', 'phrûng-níi', 'tomorrow', ['falling', 'high']],
];

/** ASCII-Kennung aus Umschrift und Tönen — eindeutig auch bei Minimalpaaren. */
function kalibrierId(roman: string, toene: Tone[]): string {
  const ascii = roman.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ʉ/g, 'ue').replace(/ɔ/g, 'or').replace(/ɛ/g, 'ae').replace(/ə/g, 'oe').replace(/[^a-z]/g, '');
  return `kal-${ascii}-${toene.join('-')}`;
}

export const KALIBRIER_WOERTER: readonly KalibrierWort[] = ZEILEN.map(([term, roman, bedeutung, toene, silbe, gruppe]) => ({
  id: kalibrierId(roman, toene), term, roman, bedeutung, toene,
  ...(silbe ? { silbe } : {}),
  ...(gruppe ? { gruppe } : {}),
}));

/**
 * Der Satz als Wortschatz für das Ton-Gate (`checkThaiTone(…, { woerter })`):
 * Silbentöne aus den Tonregeln, deshalb `sourceVerified`.
 */
export function kalibrierToneWoerter(): ToneWort[] {
  return KALIBRIER_WOERTER.map((wort) => ({
    id: wort.id,
    term: wort.term,
    syllables: wort.toene.map((tone) => ({ tone })),
    sourceVerified: true,
    source: KALIBRIER_SATZ_VERSION,
  }));
}

export function findeKalibrierWort(id: string): KalibrierWort | undefined {
  return KALIBRIER_WOERTER.find((wort) => wort.id === id);
}
