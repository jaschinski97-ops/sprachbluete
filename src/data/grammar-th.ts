/**
 * Thai-Grammatik: die Höflichkeitspartikel ครับ/ค่ะ.
 *
 * WAS HIER STEHT UND WARUM: Thai flektiert nicht — die erste echte Grammatik-
 * Entscheidung für Lernende ist die Partikel am Satzende. Sie hängt am
 * GESCHLECHT DES SPRECHERS (ครับ männlich, ค่ะ weiblich), nicht am Inhalt des
 * Satzes. Genau das übt diese kleine Sammlung: derselbe Satz, zwei mögliche
 * Sprecher — die Antwort ist die Partikel des genannten Sprechers.
 *
 * WOHER DIE SÄTZE STAMMEN: alle Thai-Formen sind wörtliche Beispielsätze aus
 * dem quellengeprüften Vokabel-Grundstock (`vocabulary.ts`, Felder
 * `exampleTerm`/`exampleRoman`) — dieEndpartikel ist abgetrennt, der Rest
 * bleibt unangetastet. Es wird kein neuer Satzstoff erfunden. Die
 * Fachlichkeit (Partikel je Sprechergeschlecht; Weiblich-Form der Aussage
 * ค่ะ mit fallendem Ton) ist Standardgrammatik; Nachweis: thai-language.com,
 * Eintrag „polite particle“, abgerufen 2026-09-13. Fragen (คะ mit hohem
 * Ton) bleiben bewusst draußen — der Grundstock hat dafür keinen geprüften
 * Satz.
 */

export type PoliteItem = {
  id: string;
  /** Der Satz OHNE Endpartikel — genau so wird er gezeigt. */
  text: string;
  /** Umschrift ohne Partikel — aus demselben Beispieleintrag. */
  roman: string;
  /** Deutsche Bedeutung des ganzen Satzes (aus dem Beispieleintrag). */
  german: string;
  /** Wer spricht — bestimmt die richtige Partikel. */
  speaker: 'male' | 'female';
  /** Die richtige Partikel. */
  answer: 'ครับ' | 'ค่ะ';
};

const ITEM = (
  id: string,
  text: string,
  roman: string,
  german: string,
  speaker: PoliteItem['speaker']
): PoliteItem => ({
  id,
  text,
  roman,
  german,
  speaker,
  answer: speaker === 'male' ? 'ครับ' : 'ค่ะ',
});

export const POLITE_ITEMS: readonly PoliteItem[] = [
  ITEM('polite-chai-m', 'ใช่', 'châi', 'Ja.', 'male'),
  ITEM('polite-chai-f', 'ใช่', 'châi', 'Ja.', 'female'),
  ITEM('polite-khobkhun-m', 'ขอบคุณ มาก', 'khɔ̀ɔp-khun mâak', 'Vielen Dank.', 'male'),
  ITEM('polite-khotoot-m', 'ขอโทษ', 'khɔ̌ɔ-thôot', 'Entschuldigung.', 'male'),
  ITEM('polite-mai-gin-muu-m', 'ผม ไม่ กิน หมู', 'phǒm mâi gin mǔu', 'Ich esse kein Schweinefleisch.', 'male'),
  ITEM('polite-chuap-gaafe-m', 'ผม ชอบ กาแฟ', 'phǒm chɔ̂ɔp gaa-fɛɛ', 'Ich mag Kaffee.', 'male'),
  ITEM('polite-gin-khaao-m', 'ผม กิน ข้าว', 'phǒm gin khâao', 'Ich esse Reis.', 'male'),
  ITEM('polite-tam-aahaan-m', 'ผม ทำ อาหาร', 'phǒm tham aa-hǎan', 'Ich mache Essen.', 'male'),
  ITEM('polite-duu-maew-m', 'ผม ดู แมว', 'phǒm duu mɛɛo', 'Ich schaue die Katze an.', 'male'),
  ITEM('polite-mai-ruu-m', 'ผม ไม่ รู้', 'phǒm mâi rúu', 'Ich weiß nicht.', 'male'),
  ITEM('polite-bpai-talaat-f', 'ฉัน ไป ตลาด', 'chǎn bpai dtà-làat', 'Ich gehe zum Markt.', 'female'),
  ITEM('polite-aan-nangsue-f', 'ฉัน อ่าน หนังสือ', 'chǎn àan nǎng-sʉ̌ʉ', 'Ich lese ein Buch.', 'female'),
  ITEM('polite-chuap-maew-f', 'ฉัน ชอบ แมว', 'chǎn chɔ̂ɔp mɛɛo', 'Ich mag Katzen.', 'female'),
  ITEM('polite-bpai-baan-f', 'ฉัน ไป บ้าน', 'chǎn bpai bâan', 'Ich gehe nach Hause.', 'female'),
];

/** Nachweis der Fachlichkeit — gleiche Struktur wie die Satzquellen. */
export const POLITE_SOURCE = {
  title: 'thai-language.com — Polite Particles',
  url: 'https://www.thai-language.com/id/2144644',
  retrieved: '2026-09-13',
  quote:
    'Polite particles ครับ (khráp, male speaker) and ค่ะ (khâ, female speaker) close statements; the particle reflects the gender of the speaker, not of the listener.',
} as const;
