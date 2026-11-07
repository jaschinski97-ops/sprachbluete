/**
 * Lesungsprüfer für Japanisch (07.11.2026, `content-plan/japanisch-lesung.cjs`):
 * Romaji aus Kana, Parser für JMdict/KANJIDIC2, Wort- und Satzprüfung. Die
 * Tests brauchen das heruntergeladene Wörterbuch nicht; sie arbeiten mit einem
 * kleinen XML-Auszug im Aufbau der echten Dateien.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  kanaZuRomaji, wortRomaji, satzRomaji, leseJmdict, leseKanjidic, woerterbuchAusXml, mitZaehlern,
  pruefeWort, pruefeSatz, pruefeTsv,
} = require('../../content-plan/japanisch-lesung.cjs');

// Auszug im JMdict-Aufbau. 犬/ワンコ ist ein gebautes Beispiel für re_nokanji.
const JMDICT = `<?xml version="1.0" encoding="UTF-8"?>
<JMdict>
<entry>
<ent_seq>1579470</ent_seq>
<k_ele>
<keb>今日</keb>
<ke_pri>ichi1</ke_pri>
</k_ele>
<r_ele>
<reb>きょう</reb>
<re_inf>&gikun;</re_inf>
</r_ele>
<r_ele>
<reb>こんにち</reb>
</r_ele>
<r_ele>
<reb>けふ</reb>
<re_inf>&ok;</re_inf>
</r_ele>
<sense>
<pos>&n;</pos>
<gloss>today</gloss>
</sense>
</entry>
<entry>
<k_ele><keb>昨日</keb></k_ele>
<r_ele><reb>きのう</reb></r_ele>
<r_ele><reb>さくじつ</reb></r_ele>
<sense><pos>&n;</pos><gloss>yesterday</gloss></sense>
</entry>
<entry>
<k_ele><keb>一人</keb></k_ele>
<k_ele><keb>独り</keb></k_ele>
<r_ele><reb>ひとり</reb></r_ele>
<r_ele><reb>いちにん</reb><re_restr>一人</re_restr></r_ele>
<sense><pos>&n;</pos><gloss>one person</gloss></sense>
</entry>
<entry>
<k_ele><keb>犬</keb></k_ele>
<r_ele><reb>いぬ</reb></r_ele>
<r_ele><reb>ワンコ</reb><re_nokanji/></r_ele>
<sense><pos>&n;</pos><gloss>dog</gloss></sense>
</entry>
<entry>
<k_ele><keb>食べる</keb></k_ele>
<r_ele><reb>たべる</reb></r_ele>
<sense><pos>&v1;</pos><pos>&vt;</pos><gloss>to eat</gloss></sense>
</entry>
<entry>
<k_ele><keb>上手</keb></k_ele>
<r_ele><reb>じょうず</reb></r_ele>
<r_ele><reb>じょうて</reb><re_inf>&ok;</re_inf></r_ele>
<sense><pos>&adj-na;</pos><gloss>skillful</gloss></sense>
</entry>
<entry>
<k_ele><keb>思う</keb></k_ele>
<r_ele><reb>おもう</reb></r_ele>
<sense><pos>&v5u;</pos><pos>&vt;</pos><gloss>to think</gloss></sense>
</entry>
<entry>
<k_ele><keb>学生</keb></k_ele>
<r_ele><reb>がくせい</reb></r_ele>
<sense><pos>&n;</pos><gloss>student</gloss></sense>
</entry>
<entry>
<k_ele><keb>三</keb></k_ele>
<r_ele><reb>さん</reb></r_ele>
<sense><pos>&num;</pos><gloss>three</gloss></sense>
</entry>
<entry>
<k_ele><keb>本</keb></k_ele>
<r_ele><reb>ほん</reb></r_ele>
<sense><pos>&n;</pos><gloss>book</gloss></sense>
</entry>
<entry>
<k_ele><keb>沿う</keb></k_ele>
<r_ele><reb>そう</reb></r_ele>
<sense><pos>&v5u;</pos><gloss>to run along</gloss></sense>
</entry>
<entry>
<k_ele><keb>層</keb></k_ele>
<r_ele><reb>そう</reb></r_ele>
<sense><pos>&n;</pos><gloss>layer</gloss></sense>
</entry>
<entry>
<r_ele><reb>コーヒー</reb></r_ele>
<sense><pos>&n;</pos><gloss>coffee</gloss></sense>
</entry>
</JMdict>`;

// Auszug im KANJIDIC2-Aufbau (Lesungen wie in der echten Datei).
const zeichen = (literal, on, kun, nanori = []) => `<character>
<literal>${literal}</literal>
<reading_meaning>
<rmgroup>
<reading r_type="pinyin">x</reading>
${on.map((r) => `<reading r_type="ja_on">${r}</reading>`).join('\n')}
${kun.map((r) => `<reading r_type="ja_kun">${r}</reading>`).join('\n')}
<meaning>x</meaning>
</rmgroup>
${nanori.map((r) => `<nanori>${r}</nanori>`).join('\n')}
</reading_meaning>
</character>`;
const KANJIDIC = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
${[
    zeichen('三', ['サン', 'ゾウ'], ['み', 'み.つ', 'みっ.つ'], ['かず', 'さぶ']),
    zeichen('本', ['ホン'], ['もと']),
    zeichen('六', ['ロク', 'リク'], ['む', 'む.つ', 'むっ.つ', 'むい']),
    zeichen('食', ['ショク', 'ジキ'], ['く.う', 'く.らう', 'た.べる', 'は.む']),
    zeichen('猫', ['ビョウ'], ['ねこ']),
    zeichen('匹', ['ヒツ'], ['ひき']),
    zeichen('人', ['ジン', 'ニン'], ['ひと', '-り', '-と']),
    zeichen('上', ['ジョウ', 'ショウ'], ['うえ', '-うえ', 'うわ-', 'かみ', 'あ.げる']),
    zeichen('手', ['シュ', 'ズ'], ['て', 'て-', '-て', 'た-']),
    zeichen('日', ['ニチ', 'ジツ'], ['ひ', '-び', '-か']),
    zeichen('今', ['コン', 'キン'], ['いま']),
    zeichen('渡', ['ト'], ['わた.る', '-わた.る', 'わた.す'], ['わたり']),
    zeichen('辺', ['ヘン'], ['あた.り', 'ほと.り', '-べ'], ['なべ', 'わたり']),
    zeichen('様', ['ヨウ', 'ショウ'], ['さま', 'さん']),
  ].join('\n')}
</kanjidic2>`;

const wb = woerterbuchAusXml(JMDICT, KANJIDIC);

test('rechnet Kana in Hepburn-Romaji um', () => {
  const faelle = {
    きょう: 'kyō', がっこう: 'gakkō', しんぶん: 'shinbun', きんえん: "kin'en", ちょっと: 'chotto', コーヒー: 'kōhī', まっちゃ: 'matcha',
    おおきい: 'ōkii', せんせい: 'sensei', おにいさん: 'oniisan', おかあさん: 'okāsan', くうき: 'kūki', ふじさん: 'fujisan',
    しゃしん: 'shashin', じゅぎょう: 'jugyō', ぢ: 'ji', づ: 'zu', きんよう: "kin'yō", みっつ: 'mittsu', いっしょ: 'issho',
    パーティー: 'pātī', ファン: 'fan', ウィキ: 'wiki', こんにちは: 'konnichiwa',
  };
  for (const [kana, romaji] of Object.entries(faelle)) assert.equal(kanaZuRomaji(kana), romaji, kana);
});

test('lässt das -u von Godan-Verben stehen und setzt Partikel im Satzmodus', () => {
  assert.equal(kanaZuRomaji('おもう'), 'omō');
  assert.equal(kanaZuRomaji('おもう', { verbAufU: true }), 'omou');
  assert.equal(wortRomaji('思う', 'おもう', wb), 'omou');
  assert.equal(wortRomaji('おもう', 'おもう', wb), 'omou');
  assert.equal(wortRomaji('そう', 'そう', wb), 'sō');
  assert.equal(kanaZuRomaji('わたし は がくせい です。', { satz: true }), 'Watashi wa gakusei desu.');
  assert.equal(kanaZuRomaji('がっこう へ いきます。', { satz: true }), 'Gakkō e ikimasu.');
  assert.equal(kanaZuRomaji('ほん を よみます', { satz: true }), 'Hon o yomimasu');
  assert.equal(kanaZuRomaji('こんにちは、たなかさん。', { satz: true }), 'Konnichiwa, tanakasan.');
  // Ohne Leerzeichen keine Wortgrenzen: は bleibt ha.
  assert.equal(kanaZuRomaji('わたしはがくせいです。', { satz: true }), 'Watashihagakuseidesu.');
  // そう ist auch 層 (kein Verb) und wird lang; おもう ist nur ein Verb.
  assert.equal(satzRomaji('そう おもう。', wb), 'Sō omou.');
});

test('liest JMdict mit re_restr, re_nokanji und ohne veraltete Lesungen', () => {
  const { lesungen, v5u, v5uKana } = leseJmdict(JMDICT);
  assert.deepEqual([...lesungen.get('今日')], ['きょう', 'こんにち']);
  assert.deepEqual([...lesungen.get('一人')], ['ひとり', 'いちにん']);
  assert.deepEqual([...lesungen.get('独り')], ['ひとり']);
  assert.deepEqual([...lesungen.get('犬')], ['いぬ']);
  assert.deepEqual([...lesungen.get('ワンコ')], ['わんこ']);
  assert.deepEqual([...lesungen.get('コーヒー')], ['こーひー']);
  assert.ok(v5u.has('思う') && !v5u.has('食べる'));
  assert.ok(v5uKana.has('おもう') && !v5uKana.has('そう'));
});

test('liest KANJIDIC2: On-Lesung in Hiragana, Kun-Lesung ohne Okurigana und Bindestrich', () => {
  const { kanji, namen } = leseKanjidic(KANJIDIC);
  assert.deepEqual([...kanji.get('食')], ['しょく', 'じき', 'く', 'た', 'は']);
  assert.deepEqual([...kanji.get('人')], ['じん', 'にん', 'ひと', 'り', 'と']);
  assert.ok(kanji.get('三').has('みっ') && !kanji.get('三').has('かず'));
  assert.deepEqual([...namen.get('三')], ['かず', 'さぶ']);
});

test('prüft Wörter gegen JMdict', () => {
  assert.equal(pruefeWort('今日', 'きょう', wb).status, 'ok');
  assert.equal(pruefeWort('今日', 'こんにち', wb).status, 'ok');
  const falsch = pruefeWort('今日', 'きのう', wb);
  assert.equal(falsch.status, 'fehler');
  assert.match(falsch.meldungen[0], /きょう, こんにち/);
  assert.equal(pruefeWort('今日', 'けふ', wb).status, 'fehler');
  assert.equal(pruefeWort('コーヒー', 'こーひー', wb).status, 'ok');
  assert.equal(pruefeWort('コーヒー', 'コーヒー', wb).status, 'ok');
  assert.equal(pruefeWort('今日', 'kyou', wb).status, 'fehler');
});

test('beachtet re_restr und re_nokanji', () => {
  assert.equal(pruefeWort('一人', 'いちにん', wb).status, 'ok');
  assert.equal(pruefeWort('独り', 'ひとり', wb).status, 'ok');
  assert.equal(pruefeWort('独り', 'いちにん', wb).status, 'fehler');
  assert.equal(pruefeWort('犬', 'わんこ', wb).status, 'fehler');
  assert.equal(pruefeWort('ワンコ', 'わんこ', wb).status, 'ok');
});

test('meldet unbekannte Schreibungen als Hinweis, Widersprüche als Fehler', () => {
  const neu = pruefeWort('猫', 'ねこ', wb);
  assert.equal(neu.status, 'hinweis');
  assert.match(neu.meldungen[0], /nicht im Wörterbuch/);
  assert.equal(pruefeWort('猫', 'いぬ', wb).status, 'fehler');
  assert.equal(pruefeWort('Tシャツ', 'てぃーしゃつ', wb).status, 'nicht prüfbar');
});

test('prüft Sätze mit Okurigana', () => {
  assert.equal(pruefeSatz('食べます', 'たべます', wb).status, 'ok');
  const falsch = pruefeSatz('食べます', 'たべす', wb);
  assert.equal(falsch.status, 'fehler');
  assert.match(falsch.meldungen.join(' '), /„ま“ aus dem Satz fehlt/);
  const satz = pruefeSatz('今日は学生です。', 'きょう は がくせい です。', wb);
  assert.equal(satz.status, 'ok');
  assert.equal(satz.zerlegung, '今日=きょう は 学生=がくせい です。');
});

test('nennt bei falscher Kanji-Lesung Stelle, Lesungsstück und bekannte Lesungen', () => {
  const e = pruefeSatz('今日は学生です。', 'きのうはがくせいです。', wb);
  assert.equal(e.status, 'fehler');
  assert.match(e.meldungen[0], /„今日“ gelesen als „きのう“ — JMdict: きょう, こんにち/);
  assert.match(pruefeSatz('猫です', 'いぬです', wb).meldungen[0], /„猫“ gelesen als „いぬ“ — KANJIDIC: 猫 びょう, ねこ/);
  assert.match(pruefeSatz('学生は', 'がくせいが', wb).meldungen[0], /Satz hat „は“, Lesung an dieser Stelle „が“/);
  assert.match(pruefeSatz('今日は', 'きょうわ', wb).meldungen[0], /Partikel in der Lesung wie geschrieben/);
});

test('setzt Lesungen aus KANJIDIC mit Rendaku und Sokuon zusammen', () => {
  assert.equal(pruefeSatz('三本', 'さんぼん', wb).status, 'ok');
  assert.equal(pruefeSatz('六本', 'ろっぽん', wb).status, 'ok');
  assert.equal(pruefeSatz('人々', 'ひとびと', wb).status, 'ok');
  // Sokuon nur vor k/s/t/p, halbtrübes p nur nach っ/ん.
  assert.equal(pruefeSatz('六本', 'ろっほん', wb).status, 'fehler');
  assert.equal(pruefeSatz('上本', 'うえぽん', wb).status, 'fehler');
});

test('nimmt Namenslesungen nur vor einer Namensendung', () => {
  assert.equal(pruefeSatz('渡辺さんです', 'わたなべさんです', wb).status, 'ok');
  assert.equal(pruefeSatz('渡辺様', 'わたなべさま', wb).status, 'ok');
  assert.equal(pruefeSatz('渡辺です', 'わたなべです', wb).status, 'fehler');
});

test('lässt Einzelzeichen-Lesungen nicht gegen ein bekanntes Wort durch', () => {
  // 上手 じょうて ist in JMdict veraltet (&ok;), aus 上 + 手 aber zusammensetzbar.
  const e = pruefeSatz('上手です', 'じょうてです', wb);
  assert.equal(e.status, 'fehler');
  assert.match(e.meldungen[0], /„上手“ gelesen als „じょうて“, zusammengesetzt aus 上=じょう \+ 手=て; als Ganzes JMdict: じょうず/);
  assert.equal(pruefeSatz('上手です', 'じょうずです', wb).status, 'ok');
});

test('ergänzt Zahl + Zählwort nach den Lehrbuchregeln', () => {
  const mit = mitZaehlern(woerterbuchAusXml(JMDICT, KANJIDIC));
  assert.deepEqual([...mit.lesungen.get('三匹')], ['さんびき']);
  assert.deepEqual([...mit.lesungen.get('六本')], ['ろっぽん']);
  assert.deepEqual([...mit.lesungen.get('八杯')], ['はっぱい', 'はちはい']);
  assert.deepEqual([...mit.lesungen.get('六冊')], ['ろくさつ']);
  assert.deepEqual([...mit.lesungen.get('四円')], ['よえん']);
  assert.equal(pruefeSatz('猫が三匹います', 'ねこがさんびきいます', mit).status, 'ok');
  const falsch = pruefeSatz('猫が三匹います', 'ねこがさんひきいます', mit);
  assert.equal(falsch.status, 'fehler');
  assert.match(falsch.meldungen[0], /Zählregel: さんびき/);
  // Auch aus zwei eigenen Wörtern (三 さん + 本 ほん) wird kein ganzes Wort.
  assert.match(pruefeSatz('本が三本', 'ほんがさんほん', mit).meldungen[0], /„三本“ gelesen als „さんほん“, zusammengesetzt aus 三=さん \+ 本=ほん/);
  assert.equal(pruefeSatz('本が三本', 'ほんがさんぼん', mit).status, 'ok');
});

test('überspringt Sätze mit Ziffern oder lateinischen Buchstaben', () => {
  assert.equal(pruefeSatz('3本あります', 'さんぼんあります', wb).status, 'nicht prüfbar');
  assert.equal(pruefeSatz('ＣＤを買います', 'しーでぃーをかいます', wb).status, 'nicht prüfbar');
});

test('prüft TSV-Zeilen und zählt Fehler', () => {
  const tsv = [
    '# begriff|wort|kana|satz|satzkana',
    'today|今日|きょう|今日は学生です。|きょう は がくせい です。',
    'eat|食べる|たべる|0|0',
    'skillful|上手|じょうて|0|0',
    'cat|猫|ねこ|猫です。|いぬ です。',
    'student|学生|がくせい|学生です。|0',
    '',
  ].join('\n');
  const { zahl, ausgabe } = pruefeTsv(tsv, 'probe.tsv', wb);
  assert.deepEqual(
    { zeilen: zahl.zeilen, wortFehler: zahl.wortFehler, wortHinweise: zahl.wortHinweise, saetze: zahl.saetze, satzFehler: zahl.satzFehler },
    { zeilen: 5, wortFehler: 1, wortHinweise: 1, saetze: 3, satzFehler: 2 },
  );
  assert.ok(ausgabe.some((z) => /^probe\.tsv:4 skillful: Wort Fehler: „上手“ wird nicht „じょうて“ gelesen/.test(z)));
  assert.ok(ausgabe.some((z) => /^probe\.tsv:6 student: Satz Fehler: Satz ohne Lesung/.test(z)));
});
