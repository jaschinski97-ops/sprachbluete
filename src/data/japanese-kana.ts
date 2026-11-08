/**
 * Die Grundtabelle der Kana (五十音) für Kapitel 0 Japanisch (07.11.2026).
 *
 * FESTE DATEN wie `thai-script.ts`: die 46 Grundzeichen von Hiragana und
 * Katakana in der Reihenfolge der Gojūon-Tabelle, Romaji im modifizierten
 * Hepburn (し shi, ち chi, つ tsu, ふ fu, を o, ん n) — en.wikipedia
 * „Gojūon“ und „Hepburn romanization“, abgerufen am 2026-11-07. Quelle zur
 * Rolle der beiden Schriften: en.wikipedia „Japanese writing system“:
 * „hiragana, used primarily for native or naturalized Japanese words and
 * grammatical elements; and katakana, used primarily for foreign names,
 * loanwords“.
 */
export type KanaZeichen = { hiragana: string; katakana: string; romaji: string };

/** Zeilen der Tabelle (あ-Reihe, か-Reihe …); `null` = leeres Feld der Tabelle. */
export const KANA_ROWS: readonly (readonly (KanaZeichen | null)[])[] = [
  'あア a いイ i うウ u えエ e おオ o',
  'かカ ka きキ ki くク ku けケ ke こコ ko',
  'さサ sa しシ shi すス su せセ se そソ so',
  'たタ ta ちチ chi つツ tsu てテ te とト to',
  'なナ na にニ ni ぬヌ nu ねネ ne のノ no',
  'はハ ha ひヒ hi ふフ fu へヘ he ほホ ho',
  'まマ ma みミ mi むム mu めメ me もモ mo',
  'やヤ ya - ゆユ yu - よヨ yo',
  'らラ ra りリ ri るル ru れレ re ろロ ro',
  'わワ wa - - - をヲ o',
  'んン n - - - -',
].map((zeile) => {
  const teile = zeile.split(' ');
  const felder: (KanaZeichen | null)[] = [];
  for (let i = 0; i < teile.length; i++) {
    if (teile[i] === '-') { felder.push(null); continue; }
    const [hiragana, katakana] = Array.from(teile[i]);
    felder.push({ hiragana, katakana, romaji: teile[i + 1] });
    i++;
  }
  return felder;
});

/** Alle 46 Grundzeichen der Reihe nach. */
export const KANA: readonly KanaZeichen[] = KANA_ROWS.flat().filter((z): z is KanaZeichen => z !== null);

export const KANA_SOURCE = {
  title: 'Japanese writing system',
  url: 'https://en.wikipedia.org/wiki/Japanese_writing_system',
  retrieved: '2026-11-07',
} as const;
