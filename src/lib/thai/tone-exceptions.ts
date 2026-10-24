/**
 * Wörter, deren Aussprache von der Schrift abweicht (24.10.2026).
 *
 * Die Ton-Engine (`tone-rules.ts`) liest den Ton aus der Schrift. Diese
 * Liste fängt die häufigen Wörter ab, bei denen das nicht stimmt —
 * jeweils mit Grund. Sie gilt auch mitten in Sätzen und längeren Wörtern.
 *
 * `lesarten`: erlaubte Paiboon-Lesungen, die übliche zuerst. `nur` begrenzt
 * eine Lesart auf Stichwort („wort“) oder Satz („satz“); im anderen Kontext
 * wird sie nur als „unsicher“ gemeldet. Mehrere Lesarten ohne `nur` gelten
 * beide (die Engine gibt dann einen Hinweis aus).
 *
 * Quellen der Lesungen: en.wiktionary.org (Paiboon-Zeile der Aussprache-
 * tabelle, abgerufen 24.10.2026) und für ไหม die Projektregel in AGENTS.md.
 * Die Goldstandard-Messung (`thai-tone-gold.ts`) deckte auf, dass เท่าไร
 * und เมื่อไร regulär „rai“ lauten (nur ไหร่ ist tief) — sie stehen nicht hier.
 */
export type TonAusnahme = {
  thai: string;
  lesarten: { roman: string; nur?: 'wort' | 'satz' }[];
  grund: string;
};

export const TON_AUSNAHMEN: TonAusnahme[] = [
  // Partikeln und Pronomen
  { thai: 'ก็', lesarten: [{ roman: 'gɔ̂ɔ' }, { roman: 'gɔ̂' }], grund: 'mit ็ ohne Auslaut geschrieben, gesprochen fallend.' },
  { thai: 'ไหม', lesarten: [{ roman: 'mǎi', nur: 'wort' }, { roman: 'mái', nur: 'satz' }],
    grund: 'Fragepartikel: geschrieben steigend, im Satz hoch gesprochen (Projektregel: Stichwort mǎi, im Satz mái).' },
  { thai: 'เขา', lesarten: [{ roman: 'khǎo' }, { roman: 'kháo' }], grund: 'Pronomen: Schrift steigend (khǎo), gesprochen meist hoch (kháo).' },
  { thai: 'ฉัน', lesarten: [{ roman: 'chǎn' }, { roman: 'chán' }], grund: 'Pronomen: Schrift steigend (chǎn), gesprochen meist hoch (chán).' },
  { thai: 'หรือ', lesarten: [{ roman: 'rʉ̌ʉ' }, { roman: 'rʉ́ʉ' }], grund: 'Konjunktion: Schrift steigend, gesprochen oft hoch.' },
  // Lehnwörter (Pali/Sanskrit/Khmer) mit abweichender Lesung
  { thai: 'ประโยชน์', lesarten: [{ roman: 'bprà-yòot' }], grund: 'Lehnwort: ย liest wie mit ห นำ (โหยด), daher tief statt fallend.' },
  { thai: 'ประวัติศาสตร์', lesarten: [{ roman: 'bprà-wàt-dtì-sàat' }], grund: 'Lehnwort: ว liest wie mit ห นำ, ต doppelt gelesen.' },
  { thai: 'ประวัติ', lesarten: [{ roman: 'bprà-wàt' }], grund: 'Lehnwort: ว liest wie mit ห นำ (หวัด), ิ stumm.' },
  { thai: 'สามารถ', lesarten: [{ roman: 'sǎa-mâat' }], grund: 'Lehnwort: ร stumm ohne ์ (สา-มาด).' },
  { thai: 'สมาคม', lesarten: [{ roman: 'sà-maa-khom' }], grund: 'Lehnwort ohne Klassenübertragung auf ม.' },
  { thai: 'สมาชิก', lesarten: [{ roman: 'sà-maa-chík' }], grund: 'Lehnwort ohne Klassenübertragung auf ม.' },
  { thai: 'สมาธิ', lesarten: [{ roman: 'sà-maa-thí' }], grund: 'Lehnwort ohne Klassenübertragung auf ม.' },
  { thai: 'กรุณา', lesarten: [{ roman: 'gà-rú-naa' }], grund: 'Lehnwort ohne Klassenübertragung auf ร.' },
  { thai: 'อนุญาต', lesarten: [{ roman: 'à-nú-yâat' }], grund: 'Lehnwort ohne Klassenübertragung auf น.' },
  { thai: 'อนุบาล', lesarten: [{ roman: 'à-nú-baan' }], grund: 'Lehnwort ohne Klassenübertragung auf น.' },
  { thai: 'สำรวจ', lesarten: [{ roman: 'sǎm-rùat' }], grund: 'Lehnwort: ร liest wie mit ห นำ (สำ-หรวด).' },
  { thai: 'ประมาท', lesarten: [{ roman: 'bprà-màat' }], grund: 'Lehnwort: ม liest wie mit ห นำ (ปฺระ-หฺมาด).' },
  { thai: 'ตำรวจ', lesarten: [{ roman: 'dtam-rùat' }], grund: 'Lehnwort: ร liest wie mit ห นำ (ตำ-หรวด).' },
  { thai: 'สำเร็จ', lesarten: [{ roman: 'sǎm-rèt' }], grund: 'Lehnwort: ร übernimmt die hohe Klasse von ส trotz ำ.' },
  { thai: 'กำเนิด', lesarten: [{ roman: 'gam-nə̀ət' }], grund: 'Lehnwort: น übernimmt die mittlere Klasse von ก trotz ำ.' },
  { thai: 'เพชร', lesarten: [{ roman: 'phét' }], grund: 'Lehnwort: kurz gesprochen (เพ็ด), ร stumm.' },
  { thai: 'สหรัฐ', lesarten: [{ roman: 'sà-hà-rát' }], grund: 'Lehnwort ohne Klassenübertragung auf ร.' },
  { thai: 'เกษตร', lesarten: [{ roman: 'gà-sèet' }], grund: 'Lehnwort: เ gehört zu ษ, ร stumm.' },
  // Englische Lehnwörter: Thai spricht betonte geschlossene Silben oft hoch,
  // auslautendes -er fallend — gegen die Tonregel der Schrift.
  { thai: 'ช็อกโกแลต', lesarten: [{ roman: 'chɔ́k-goo-lɛ́t' }], grund: 'englisches Lehnwort (chocolate): แลต hoch statt fallend.' },
  { thai: 'ซอส', lesarten: [{ roman: 'sɔ́ɔt' }], grund: 'englisches Lehnwort (sauce): hoch statt fallend.' },
  { thai: 'เนคไท', lesarten: [{ roman: 'nék-thai' }, { roman: 'nék-thái' }], grund: 'englisches Lehnwort (necktie): kurz und hoch gesprochen.' },
  { thai: 'ยีราฟ', lesarten: [{ roman: 'yii-ráap' }], grund: 'englisches Lehnwort (giraffe): ราฟ hoch statt fallend.' },
  { thai: 'แอปเปิ้ล', lesarten: [{ roman: 'ɛ́p-bpə̂n' }], grund: 'englisches Lehnwort (apple): แอป hoch statt tief.' },
  { thai: 'แอป', lesarten: [{ roman: 'ɛ́p' }], grund: 'englisches Lehnwort (app): hoch statt tief.' },
  { thai: 'บรอกโคลี', lesarten: [{ roman: 'brɔ́k-khoo-lîi' }], grund: 'englisches Lehnwort (broccoli): hoch und fallend gegen die Schrift.' },
  { thai: 'ซูเปอร์มาร์เก็ต', lesarten: [{ roman: 'suu-bpə̂ə-maa-gêt' }], grund: 'englisches Lehnwort (supermarket): -er und -ket fallend.' },
  { thai: 'คอมพิวเตอร์', lesarten: [{ roman: 'khɔm-phiu-dtə̂ə' }, { roman: 'khɔm-phíu-dtə̂ə' }], grund: 'englisches Lehnwort (computer): -ter fallend.' },
  { thai: 'แฮมเบอร์เกอร์', lesarten: [{ roman: 'hɛm-bəə-gə̂ə' }], grund: 'englisches Lehnwort (hamburger): -ger fallend.' },
  { thai: 'การ์ด', lesarten: [{ roman: 'gáat' }], grund: 'englisches Lehnwort (card): hoch statt tief.' },
  { thai: 'คลินิก', lesarten: [{ roman: 'khlí-nìk' }], grund: 'englisches Lehnwort (clinic): นิก tief statt hoch.' },
  { thai: 'อินเทอร์เน็ต', lesarten: [{ roman: 'in-thəə-nèt' }], grund: 'englisches Lehnwort (internet): เน็ต tief statt hoch.' },
  { thai: 'เมตร', lesarten: [{ roman: 'méet' }], grund: 'Lehnwort (Meter): hoch statt fallend, ร stumm.' },
  { thai: 'สวิตช์', lesarten: [{ roman: 'sà-wít' }], grund: 'englisches Lehnwort (switch): ohne Klassenübertragung auf ว.' },
  { thai: 'เชฟ', lesarten: [{ roman: 'chéep' }], grund: 'englisches Lehnwort (chef): hoch statt fallend.' },
  { thai: 'พลาสติก', lesarten: [{ roman: 'phláat-sà-dtìk' }, { roman: 'phláat-dtìk' }], grund: 'englisches Lehnwort (plastic): พลาส hoch statt fallend.' },
  { thai: 'วิสกี้', lesarten: [{ roman: 'wít-sà-gîi' }, { roman: 'wít-gîi' }], grund: 'englisches Lehnwort (whisky); Wiktionary schreibt wís-gîi.' },
  { thai: 'แซลมอน', lesarten: [{ roman: 'sɛɛn-mɔ̂n' }, { roman: 'sɛo-mɔ̂n' }], grund: 'englisches Lehnwort (salmon): มอน fallend; Wiktionary schreibt sɛɛl-mɔ̂n.' },
  { thai: 'อีเมล', lesarten: [{ roman: 'ii-meeo' }, { roman: 'ii-meen' }], grund: 'englisches Lehnwort (e-mail): ล als o oder n; Wiktionary schreibt ii-meel.' },
  { thai: 'โทร', lesarten: [{ roman: 'thoo' }], grund: 'Kurzform von โทรศัพท์ (anrufen): ร stumm ohne ์.' },
];
