/**
 * Japanische Zählwörter (助数詞) mit Lesung (07.11.2026).
 *
 * Japanisch zählt Dinge mit Zahl + Zählwort, das zur Art des Gezählten passt —
 * en.wikipedia „Japanese counter word“, abgerufen am 2026-11-07: „In Japanese,
 * as in Chinese and Korean, numerals cannot quantify nouns by themselves“.
 * Die Lesungen „zwei + Zählwort“ (二本 にほん, 二人 ふたり, 二つ ふたつ) stehen
 * hier ausgeschrieben, weil sie nicht immer regelmäßig sind.
 *
 * Diese Liste ist die Menge, die ein Wort in `japaneseNoun.counter` tragen
 * darf (Schema-Prüfung); `content-plan/japanische-woerter.cjs` kennt dieselbe.
 */
export type JapaneseCounter = { kana: string; romaji: string; zwei: string; zweiRomaji: string };

const eintrag = (kana: string, romaji: string, zwei?: string, zweiRomaji?: string): JapaneseCounter => ({
  kana,
  romaji: romaji.normalize('NFC'),
  zwei: zwei ?? `に${kana}`,
  zweiRomaji: (zweiRomaji ?? `ni${romaji}`).normalize('NFC'),
});

export const JAPANESE_COUNTERS: Readonly<Record<string, JapaneseCounter>> = {
  つ: eintrag('つ', 'tsu', 'ふたつ', 'futatsu'),
  個: eintrag('こ', 'ko'),
  本: eintrag('ほん', 'hon'),
  枚: eintrag('まい', 'mai'),
  冊: eintrag('さつ', 'satsu'),
  匹: eintrag('ひき', 'hiki'),
  頭: eintrag('とう', 'tō'),
  羽: eintrag('わ', 'wa'),
  台: eintrag('だい', 'dai'),
  人: eintrag('にん', 'nin', 'ふたり', 'futari'),
  杯: eintrag('はい', 'hai'),
  足: eintrag('そく', 'soku'),
  着: eintrag('ちゃく', 'chaku'),
  軒: eintrag('けん', 'ken'),
  通: eintrag('つう', 'tsū'),
  輪: eintrag('りん', 'rin'),
  粒: eintrag('つぶ', 'tsubu', 'ふたつぶ', 'futatsubu'),
  機: eintrag('き', 'ki'),
  隻: eintrag('せき', 'seki'),
  脚: eintrag('きゃく', 'kyaku'),
  部: eintrag('ぶ', 'bu'),
  曲: eintrag('きょく', 'kyoku'),
  棟: eintrag('とう', 'tō'),
  膳: eintrag('ぜん', 'zen'),
  丁: eintrag('ちょう', 'chō'),
  件: eintrag('けん', 'ken'),
  皿: eintrag('さら', 'sara', 'ふたさら', 'futasara'),
};

/** Ist das ein bekanntes Zählwort? */
export function isJapaneseCounter(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(JAPANESE_COUNTERS, value);
}
