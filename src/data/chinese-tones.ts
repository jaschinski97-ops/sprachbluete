import type { TranslationKey } from '@/lib/i18n';

/**
 * Die Töne des Hochchinesischen für Kapitel 0 (07.11.2026).
 *
 * FESTE DATEN wie `thai-script.ts`: Die Tabelle stammt aus en.wikipedia
 * „Standard Chinese phonology“, Abschnitt „Tones“, abgerufen am 2026-11-07:
 * „The following table shows the four main tones of Standard Chinese,
 * together with the neutral (or fifth) tone.“ Spalten der Quelle:
 * Beschreibung (high, rising, low (dipping), falling, neutral),
 * Pinyin-Zeichen (ā á ǎ à a) und die Beispiele 巴/bā, 拔/bá, 把/bǎ, 爸/bà,
 * 吧/ba. Die Beispiele stehen hier genau so, nicht durch eigene ersetzt.
 */
export type ChineseTone = {
  /** 1–4, 5 = neutraler Ton. */
  number: 1 | 2 | 3 | 4 | 5;
  /** Name und Verlauf in der App-Sprache. */
  label: TranslationKey;
  /** Das Tonzeichen auf a. */
  mark: string;
  /** Beispielsilbe der Quelle: Schriftzeichen und Pinyin. */
  example: { hanzi: string; pinyin: string };
};

export const CHINESE_TONES: readonly ChineseTone[] = [
  { number: 1, label: 'foundations.zhTone1', mark: 'ā', example: { hanzi: '巴', pinyin: 'bā' } },
  { number: 2, label: 'foundations.zhTone2', mark: 'á', example: { hanzi: '拔', pinyin: 'bá' } },
  { number: 3, label: 'foundations.zhTone3', mark: 'ǎ', example: { hanzi: '把', pinyin: 'bǎ' } },
  { number: 4, label: 'foundations.zhTone4', mark: 'à', example: { hanzi: '爸', pinyin: 'bà' } },
  { number: 5, label: 'foundations.zhTone5', mark: 'a', example: { hanzi: '吧', pinyin: 'ba' } },
].map((tone) => ({ ...tone, mark: tone.mark.normalize('NFC'), example: { ...tone.example, pinyin: tone.example.pinyin.normalize('NFC') } })) as readonly ChineseTone[];

export const CHINESE_TONES_SOURCE = {
  title: 'Standard Chinese phonology',
  url: 'https://en.wikipedia.org/wiki/Standard_Chinese_phonology',
  retrieved: '2026-11-07',
  quote: 'In addition to the four main tones, there is a neutral tone that appears on weak syllables.',
} as const;
