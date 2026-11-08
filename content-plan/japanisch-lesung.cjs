#!/usr/bin/env node
/**
 * Lesungsprüfer für Japanisch (07.11.2026). Japanisch ist noch KEINE
 * Lernsprache; das Werkzeug steht bereit, bevor Claude japanische Wörter,
 * Beispielsätze und Dialoge schreibt. Das Hauptrisiko ist die Lesung der
 * Kanji (今日 きょう/こんにち, 三本 さんぼん, 六本 ろっぽん, 上手 じょうず).
 * Geprüft wird die Kana-Lesung gegen JMdict (Wörter) und KANJIDIC2
 * (Einzelzeichen); das Romaji wird daraus gerechnet (modifiziertes Hepburn),
 * nie von Hand geschrieben.
 *
 *   node content-plan/japanisch-lesung.cjs lade             Zwischenspeicher bauen
 *   node content-plan/japanisch-lesung.cjs wort <wort> <kana>
 *   node content-plan/japanisch-lesung.cjs satz <satz> <kana>
 *   node content-plan/japanisch-lesung.cjs romaji <kana> [--satz]
 *   node content-plan/japanisch-lesung.cjs pruefe <datei.tsv> …
 *
 * TSV-Zeile (Felder mit „|“, „#“ am Zeilenanfang = Kommentar):
 *   begriff|wort|kana|satz|satzkana
 *   wort      Schreibung wie im Wörterbuch, darf reines Kana sein; „-“ = auslassen
 *   kana      Lesung in Kana (Katakana-Wörter dürfen in Katakana bleiben)
 *   satz      Beispielsatz oder „0“ (keiner)
 *   satzkana  Lesung des ganzen Satzes in Kana, Wörter mit Leerzeichen getrennt
 *             (nur so kennt das Romaji die Partikel は/へ = wa/e), Partikel wie
 *             geschrieben (は, へ, を), oder „0“
 *
 * Wörterbücher (EDRDG, CC BY-SA 4.0) nur zum Prüfen, nie in App oder Git:
 *   _Local/woerterbuch/JMdict_e.gz, _Local/woerterbuch/kanjidic2.xml.gz
 *   Zwischenspeicher: _Local/woerterbuch/japanisch-lesungen.json
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const ORDNER = path.join(ROOT, '_Local/woerterbuch');
const JMDICT = path.join(ORDNER, 'JMdict_e.gz');
const KANJIDIC = path.join(ORDNER, 'kanjidic2.xml.gz');
const SPEICHER = path.join(ORDNER, 'japanisch-lesungen.json');
const FORMAT = 2;

/* ---------- Zeichen ---------- */

const normal = (text) => String(text ?? '').normalize('NFKC');
const SATZZEICHEN = /^[\s。、，．,.!?！？「」『』（）()【】〔〕［］[\]・…‥〜~:：;；"“”'‘’]$/u;
const NICHT_PRUEFBAR = /[0-9A-Za-z]/;

/** Katakana → Hiragana (ァ–ヴ, ヽヾ); ー, ヵ, ヶ bleiben. */
function zuHiragana(text) {
  return Array.from(normal(text)).map((z) => {
    const c = z.codePointAt(0);
    return (c >= 0x30a1 && c <= 0x30f4) || c === 0x30fd || c === 0x30fe ? String.fromCodePoint(c - 0x60) : z;
  }).join('');
}

const istKana = (z) => /^[ぁ-ゖゝゞァ-ヺーヽヾ]$/u.test(z) && z !== 'ヵ' && z !== 'ヶ';
// ヵ/ヶ (一ヶ月) stehen wie ein Kanji für eine Lesung.
const istKanji = (z) => /^\p{Script=Han}$/u.test(z) || z === 'ヵ' || z === 'ヶ' || z === '〆';

/* ---------- Romaji (modifiziertes Hepburn) ---------- */

const ROMAJI = new Map(('あa いi うu えe おo かka きki くku けke こko がga ぎgi ぐgu げge ごgo '
  + 'さsa しshi すsu せse そso ざza じji ずzu ぜze ぞzo たta ちchi つtsu てte とto '
  + 'だda ぢji づzu でde どdo なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho '
  + 'ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo まma みmi むmu めme もmo '
  + 'やya ゆyu よyo らra りri るru れre ろro わwa ゐi ゑe をo ゔvu '
  + 'ぁa ぃi ぅu ぇe ぉo ゃya ゅyu ょyo ゎwa ゕka ゖke').split(' ').map((t) => [t[0], t.slice(1)]));
const KLEIN_Y = new Set(['ゃ', 'ゅ', 'ょ']);
const KLEIN_V = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゎ']);
const VOKALE = new Set(['あ', 'い', 'う', 'え', 'お']);
const MAKRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const SATZZEICHEN_ROMAJI = { '。': '.', '、': ',', '，': ',', '．': '.', '「': '“', '」': '”', '『': '“', '』': '”', '・': ' ', '〜': '~' };
// Grüße, deren は als „wa“ gesprochen wird, auch ohne Wortgrenzen.
const GRUSS_WA = new Set(['こんにちは', 'こんばんは']);
// Partikelfolgen mit は am Ende; nur als eigenes Wort (Satzmodus mit Leerzeichen).
const PARTIKEL_WA = new Set(['では', 'には', 'とは', 'からは', 'までは', 'へは', 'よりは', 'それでは', ...GRUSS_WA]);

/** Zerlegt Hiragana in Silben (ゃゅょ- und Klein-Vokal-Verbindungen zusammen). */
function silbenVon(hira) {
  const z = Array.from(hira);
  const liste = [];
  for (let i = 0; i < z.length; i += 1) {
    const k = z[i];
    const weiter = z[i + 1];
    if (k === 'っ') { liste.push({ art: 'tsu', kana: k }); continue; }
    if (k === 'ん') { liste.push({ art: 'n', kana: k, romaji: 'n' }); continue; }
    if (k === 'ー') { liste.push({ art: 'lang', kana: k }); continue; }
    const r = ROMAJI.get(k);
    if (r === undefined) { liste.push({ art: 'zeichen', kana: k }); continue; }
    const anlaut = r.replace(/[aiueo]$/, '');
    const klein = KLEIN_Y.has(k) || KLEIN_V.has(k);
    if (!klein && anlaut && KLEIN_Y.has(weiter)) {
      const v = ROMAJI.get(weiter).slice(-1);
      liste.push({ art: 'silbe', kana: k + weiter, romaji: /^(sh|ch|j)$/.test(anlaut) ? anlaut + v : `${anlaut}y${v}` });
      i += 1;
      continue;
    }
    if (!klein && KLEIN_V.has(weiter)) {
      const v = ROMAJI.get(weiter);
      let verbunden = null;
      if (k === 'う') verbunden = `w${v.slice(-1)}`;
      else if (k === 'い' && weiter === 'ぇ') verbunden = 'ye';
      else if ((k === 'く' || k === 'ぐ') && (weiter === 'ぁ' || weiter === 'ゎ')) verbunden = `${anlaut}wa`;
      else if (anlaut) verbunden = anlaut + v;
      if (verbunden) {
        liste.push({ art: 'silbe', kana: k + weiter, romaji: verbunden });
        i += 1;
        continue;
      }
    }
    liste.push({ art: VOKALE.has(k) ? 'vokal' : 'silbe', kana: k, romaji: r });
  }
  return liste;
}

function verlaengere(aus) {
  const letzter = aus[aus.length - 1] ?? '';
  const v = letzter.slice(-1);
  if (MAKRON[v]) aus[aus.length - 1] = letzter.slice(0, -1) + MAKRON[v];
}

/** Ein Wort ohne Satzzeichen; `verbAufU` = Godan-Verb auf -u (思う omou, nicht omō). */
function romajiWort(hira, verbAufU) {
  if (GRUSS_WA.has(hira)) return `${romajiWort(hira.slice(0, -1), false)}wa`;
  const liste = silbenVon(hira);
  const aus = [];
  liste.forEach((s, n) => {
    const naechste = liste[n + 1];
    if (s.art === 'tsu') {
      // っ verdoppelt den Folgekonsonanten, vor ch als t (まっちゃ matcha).
      const r = naechste?.art === 'silbe' ? naechste.romaji : '';
      if (/^[bcdfghjkmnprstvwz]/.test(r)) aus.push(r.startsWith('ch') ? 't' : r[0]);
      return;
    }
    if (s.art === 'n') {
      const vorVokal = (naechste?.art === 'vokal' || naechste?.art === 'silbe') && /^[aiueoy]/.test(naechste.romaji);
      aus.push(vorVokal ? "n'" : 'n');
      return;
    }
    if (s.art === 'lang') { verlaengere(aus); return; }
    if (s.art === 'vokal' && n > 0 && ['silbe', 'vokal'].includes(liste[n - 1].art)) {
      const v = (aus[aus.length - 1] ?? '').slice(-1);
      const gesperrt = verbAufU && n === liste.length - 1 && s.kana === 'う';
      const lang = (v === 'o' && (s.kana === 'う' || s.kana === 'お')) || (v === 'u' && s.kana === 'う')
        || (v === 'a' && s.kana === 'あ') || (v === 'e' && s.kana === 'え');
      if (lang && !gesperrt) { verlaengere(aus); return; }
    }
    aus.push(s.art === 'zeichen' ? (SATZZEICHEN_ROMAJI[s.kana] ?? s.kana) : s.romaji);
  });
  return aus.join('');
}

/**
 * Kana → Romaji. Langvokale: おう/おお → ō, うう → ū, ああ → ā, ええ → ē, ー mit
 * Makron; えい und いい bleiben. Im Satzmodus (`satz: true`) gelten Leerzeichen
 * und Satzzeichen als Wortgrenzen: ein einzelnes は/へ wird wa/e. Ohne
 * Leerzeichen gibt es keine Partikelregel (außer こんにちは/こんばんは).
 * `verbAufU`: true oder Funktion (Wort in Hiragana → true), wenn ein
 * abschließendes う zu einem Godan-Verb gehört und nicht verlängert.
 */
function kanaZuRomaji(kana, { satz = false, verbAufU = false } = {}) {
  const hira = zuHiragana(kana).trim();
  const istVerb = (wort) => (typeof verbAufU === 'function' ? Boolean(verbAufU(wort)) : Boolean(verbAufU));
  if (!satz) return romajiWort(hira, istVerb(hira));
  const teile = hira.split(/([\s、。，．,.!?「」『』()・…〜~:;]+)/u);
  const text = teile.map((teil, n) => {
    if (n % 2 === 1) return Array.from(teil).map((z) => (/\s/.test(z) ? ' ' : SATZZEICHEN_ROMAJI[z] ?? z)).join('');
    if (teil === 'は') return 'wa';
    if (teil === 'へ') return 'e';
    if (PARTIKEL_WA.has(teil)) return `${romajiWort(teil.slice(0, -1), false)}wa`;
    // Satzendpartikel nach höflicher Form als eigenes Wort: ですか → desu ka, ますね → masu ne.
    const ende = teil.match(/^(.*(?:です|ます|でした|ました|ません|ましょう))([かねよ])$/u);
    if (ende) return `${romajiWort(ende[1], false)} ${romajiWort(ende[2], false)}`;
    return romajiWort(teil, istVerb(teil));
  }).join('');
  return text.replace(/\s+/g, ' ').replace(/ ([,.!?”)])/g, '$1').replace(/([,.!?])(?=[^\s,.!?”)])/g, '$1 ').trim()
    .replace(/^([“(]?)(\p{Ll})/u, (_, vor, b) => vor + b.toUpperCase())
    // Jeder Satz beginnt groß, auch der zweite in einer Zeile („… desu. Kono …“).
    .replace(/([.?!] [“(]?)(\p{Ll})/gu, (_, vor, b) => vor + b.toUpperCase());
}

/** Romaji eines Wortes; Godan-Verben auf -u (思う) bleibt das う. */
function wortRomaji(wort, kana, wb = standardWoerterbuch()) {
  const w = normal(wort).trim();
  const verb = Array.from(w).some(istKanji) ? wb.v5u.has(w) : wb.v5uKana.has(zuHiragana(w));
  return kanaZuRomaji(kana, { verbAufU: verb });
}

/** Romaji eines Satzes; Kana-Wörter, die nur Godan-Verben auf -u sein können, behalten das う. */
function satzRomaji(kana, wb = standardWoerterbuch()) {
  return kanaZuRomaji(kana, { satz: true, verbAufU: (w) => wb.v5uKana.has(w) });
}

/* ---------- JMdict und KANJIDIC2 ---------- */

/** Inhalte aller <tag>…</tag>-Blöcke (ohne Attribute), der Reihe nach. */
function bloecke(text, tag) {
  const auf = `<${tag}>`;
  const zu = `</${tag}>`;
  const liste = [];
  let ab = text.indexOf(auf);
  while (ab >= 0) {
    const ende = text.indexOf(zu, ab);
    if (ende < 0) break;
    liste.push(text.slice(ab + auf.length, ende));
    ab = text.indexOf(auf, ende);
  }
  return liste;
}

const xmlText = (text) => normal(text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')).trim();

function dazu(map, schluessel, wert) {
  if (!map.has(schluessel)) map.set(schluessel, new Set());
  map.get(schluessel).add(wert);
}

/**
 * JMdict-XML → Schreibung → Menge erlaubter Lesungen (Hiragana). Beachtet
 * re_restr (Lesung nur für die genannten Schreibungen) und re_nokanji (Lesung
 * für keine Kanji-Schreibung). Jede Kana-Schreibung ist ihre eigene Lesung.
 * Veraltete (&ok;) und reine Suchformen (&sk;) zählen nicht als Lesung.
 * Dazu: Kanji-Schreibungen von Godan-Verben auf -u (`v5u`, für das Romaji: 思う
 * omou), Kana-Lesungen, die NUR zu solchen Verben gehören (`v5uKana`; そう
 * fehlt, weil es auch 層/総 ist), und Schreibungen, die JMdict nur als
 * Suchform oder veraltet führt (`unueblich`).
 */
function leseJmdict(xml) {
  const lesungen = new Map();
  const v5u = new Set();
  const v5uLesungen = new Set();
  const andereLesungen = new Set();
  const ueblich = new Set();
  const selten = new Set();
  for (const eintrag of bloecke(xml, 'entry')) {
    const kanji = bloecke(eintrag, 'k_ele').map((k) => ({ text: xmlText(bloecke(k, 'keb')[0] ?? ''), inf: bloecke(k, 'ke_inf') }));
    const lesen = bloecke(eintrag, 'r_ele').map((r) => ({
      text: xmlText(bloecke(r, 'reb')[0] ?? ''),
      ohneKanji: /<re_nokanji\s*\/?>/.test(r),
      nur: bloecke(r, 're_restr').map(xmlText),
      inf: bloecke(r, 're_inf'),
    }));
    for (const k of kanji) (k.inf.some((i) => i === '&sK;' || i === '&oK;') ? selten : ueblich).add(k.text);
    for (const r of lesen) {
      if (!r.text || r.inf.some((i) => i === '&ok;' || i === '&sk;')) continue;
      const kana = zuHiragana(r.text);
      dazu(lesungen, r.text, kana);
      if (r.ohneKanji) continue;
      for (const k of kanji) if (k.text && (!r.nur.length || r.nur.includes(k.text))) dazu(lesungen, k.text, kana);
    }
    const verb = /<pos>&v5u(-s)?;<\/pos>/.test(eintrag);
    if (verb) for (const k of kanji) v5u.add(k.text);
    for (const r of lesen) (verb ? v5uLesungen : andereLesungen).add(zuHiragana(r.text));
  }
  return {
    lesungen,
    v5u,
    v5uKana: new Set([...v5uLesungen].filter((k) => !andereLesungen.has(k))),
    unueblich: new Set([...selten].filter((s) => !ueblich.has(s))),
  };
}

/**
 * KANJIDIC2-XML → { kanji, namen }: je Kanji die Lesungen in Hiragana.
 * On-Lesungen von Katakana umgeschrieben, Kun-Lesungen ohne Okurigana (Teil
 * vor dem Punkt), Bindestriche (Vor-/Nachsilbe) entfernt. Namenslesungen
 * (nanori, 渡辺 わたなべ) stehen getrennt und gelten nur vor さん/様 usw.
 */
function leseKanjidic(xml) {
  const kanji = new Map();
  const namen = new Map();
  for (const zeichen of bloecke(xml, 'character')) {
    const literal = (bloecke(zeichen, 'literal')[0] ?? '').trim();
    if (!literal) continue;
    for (const m of zeichen.matchAll(/<reading r_type="ja_(?:on|kun)"[^>]*>([^<]+)<\/reading>/g)) {
      const lesung = zuHiragana(m[1].split('.')[0].replace(/-/g, '')).trim();
      if (lesung) dazu(kanji, literal, lesung);
    }
    for (const n of bloecke(zeichen, 'nanori')) {
      const lesung = zuHiragana(n.replace(/-/g, '')).trim();
      if (lesung && !kanji.get(literal)?.has(lesung)) dazu(namen, literal, lesung);
    }
  }
  return { kanji, namen };
}

/**
 * Stämme für gebeugte Formen: 食べる → 食 = た, 行く → 行 = い. Die Kana am
 * Ende der Schreibung (Okurigana) stehen auch am Ende der Lesung.
 */
function baueStaemme(lesungen) {
  const stamm = new Map();
  for (const [schreibung, set] of lesungen) {
    const z = Array.from(schreibung);
    let ende = z.length;
    while (ende > 0 && istKana(z[ende - 1])) ende -= 1;
    if (ende === 0 || ende === z.length || !istKanji(z[ende - 1])) continue;
    const kopf = z.slice(0, ende).join('');
    const okurigana = zuHiragana(z.slice(ende).join(''));
    for (const lesung of set) {
      if (lesung.length > okurigana.length && lesung.endsWith(okurigana)) dazu(stamm, kopf, lesung.slice(0, -okurigana.length));
    }
  }
  return stamm;
}

/** Fertiges Prüf-Wörterbuch aus Lesungen (JMdict) und Kanji (KANJIDIC). */
function woerterbuch({ lesungen, kanji, namen = new Map(), v5u = new Set(), v5uKana = new Set(), unueblich = new Set(), zaehler = new Set() }) {
  let maxLaenge = 1;
  for (const s of lesungen.keys()) if (Array.from(s).some(istKanji)) maxLaenge = Math.max(maxLaenge, Array.from(s).length);
  return { lesungen, kanji, namen, v5u, v5uKana, unueblich, zaehler, stamm: baueStaemme(lesungen), maxLaenge: Math.min(maxLaenge, 40) };
}

function woerterbuchAusXml(jmdictXml, kanjidicXml) {
  return woerterbuch({ ...leseJmdict(jmdictXml), ...leseKanjidic(kanjidicXml) });
}

/* ---------- Zahl + Zählwort ---------- */

const ZAHLEN = { 一: 'いち', 二: 'に', 三: 'さん', 四: 'よん', 五: 'ご', 六: 'ろく', 七: 'なな', 八: 'はち', 九: 'きゅう', 十: 'じゅう', 何: 'なん' };
// Zählwort: Lesung, Anlautgruppe (h: 1/6/8/10 → っp, 3/何 → b; k: 1/6/8/10 → っ;
// s: 1/8/10 → っ), stimmhafte Form nach 三/何.
const ZAEHLER = {
  本: ['ほん', 'h'], 匹: ['ひき', 'h'], 杯: ['はい', 'h'],
  個: ['こ', 'k'], 回: ['かい', 'k'], 階: ['かい', 'k', 'がい'], 軒: ['けん', 'k', 'げん'],
  冊: ['さつ', 's'], 歳: ['さい', 's'], 足: ['そく', 's', 'ぞく'], 着: ['ちゃく', 's'], 頭: ['とう', 's'],
  枚: ['まい', ''], 台: ['だい', ''], 円: ['えん', ''],
};
const halbtrueb = (l) => 'ぱぴぷぺぽ'['はひふへほ'.indexOf(l[0])] + l.slice(1);
const trueb = (l) => 'ばびぶべぼ'['はひふへほ'.indexOf(l[0])] + l.slice(1);

/** Lesungen von Zahl + Zählwort nach den Lehrbuchregeln (三本 さんぼん, 六匹 ろっぴき). */
function zaehlLesungen(zahl, zeichen) {
  const [l, gruppe, stimmhaft] = ZAEHLER[zeichen];
  const z = ZAHLEN[zahl];
  const kurz = { 一: ['いっ'], 八: ['はっ'], 十: ['じゅっ', 'じっ'], ...(gruppe !== 's' ? { 六: ['ろっ'] } : {}) };
  if (gruppe === 'h') {
    if (kurz[zahl]) return [...kurz[zahl].map((k) => k + halbtrueb(l)), ...(zahl === '八' ? [z + l] : [])];
    if (zahl === '三' || zahl === '何') return [z + trueb(l)];
  } else if (gruppe) {
    if (kurz[zahl]) return [...kurz[zahl].map((k) => k + l), ...(zahl === '八' ? [z + l] : [])];
    if (stimmhaft && (zahl === '三' || zahl === '何')) return [z + stimmhaft];
  }
  if (zahl === '四' && zeichen === '円') return ['よえん'];
  return zahl === '七' ? [z + l, `しち${l}`] : [z + l];
}

/** Ergänzt Zahl + Zählwort, die JMdict nicht kennt (三匹, 何本 …), als feste Lesung. */
function mitZaehlern(wb) {
  for (const zahl of Object.keys(ZAHLEN)) {
    for (const zeichen of Object.keys(ZAEHLER)) {
      const schreibung = zahl + zeichen;
      if (wb.lesungen.has(schreibung)) continue;
      wb.lesungen.set(schreibung, new Set(zaehlLesungen(zahl, zeichen)));
      wb.zaehler.add(schreibung);
    }
  }
  wb.maxLaenge = Math.max(wb.maxLaenge, 2);
  return wb;
}

/* ---------- Zwischenspeicher ---------- */

function fehltFehler() {
  const rel = (f) => path.relative(ROOT, f);
  const fehler = Error(`Japanisches Wörterbuch fehlt (${rel(JMDICT)}, ${rel(KANJIDIC)}). Einmalig laden:
  mkdir -p ${rel(ORDNER)}
  curl -o ${rel(JMDICT)} http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
  curl -o ${rel(KANJIDIC)} http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
  node content-plan/japanisch-lesung.cjs lade
(EDRDG, CC BY-SA 4.0; nur zum Prüfen, nie in App oder Git.)`);
  fehler.code = 'WOERTERBUCH_FEHLT';
  return fehler;
}

const quellenStand = () => [JMDICT, KANJIDIC].map((f) => {
  const st = fs.statSync(f);
  return { datei: path.basename(f), bytes: st.size, mtimeMs: Math.round(st.mtimeMs) };
});
const quellenDa = () => fs.existsSync(JMDICT) && fs.existsSync(KANJIDIC);
const entpackt = (datei) => zlib.gunzipSync(fs.readFileSync(datei)).toString('utf8');
const alsListen = (map) => Object.fromEntries([...map].map(([k, v]) => [k, [...v]]));
const alsSets = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));

/** Liest JMdict und KANJIDIC2 ein und schreibt den kompakten Zwischenspeicher. */
function baueSpeicher() {
  if (!quellenDa()) throw fehltFehler();
  const jm = leseJmdict(entpackt(JMDICT));
  const { kanji, namen } = leseKanjidic(entpackt(KANJIDIC));
  const daten = {
    format: FORMAT,
    quellen: quellenStand(),
    lesungen: alsListen(jm.lesungen),
    kanji: alsListen(kanji),
    namen: alsListen(namen),
    v5u: [...jm.v5u],
    v5uKana: [...jm.v5uKana],
    unueblich: [...jm.unueblich],
  };
  fs.writeFileSync(SPEICHER, JSON.stringify(daten));
  return daten;
}

const ausDaten = (d) => mitZaehlern(woerterbuch({
  lesungen: alsSets(d.lesungen),
  kanji: alsSets(d.kanji),
  namen: alsSets(d.namen),
  v5u: new Set(d.v5u),
  v5uKana: new Set(d.v5uKana),
  unueblich: new Set(d.unueblich),
}));

let geladen = null;
/** Wörterbuch aus dem Zwischenspeicher; baut ihn neu, wenn er fehlt oder veraltet ist. */
function standardWoerterbuch() {
  if (geladen) return geladen;
  let daten = null;
  if (fs.existsSync(SPEICHER)) {
    try { daten = JSON.parse(fs.readFileSync(SPEICHER, 'utf8')); } catch { daten = null; }
    const veraltet = daten && quellenDa() && JSON.stringify(daten.quellen) !== JSON.stringify(quellenStand());
    if (!daten || daten.format !== FORMAT || veraltet) daten = null;
  }
  if (!daten) {
    if (!quellenDa()) throw fehltFehler();
    process.stderr.write('Baue Zwischenspeicher aus JMdict und KANJIDIC2 …\n');
    daten = baueSpeicher();
  }
  geladen = ausDaten(daten);
  return geladen;
}

/* ---------- Prüfung ---------- */

function lesungsProblem(kana) {
  const fremd = Array.from(normal(kana)).filter((z) => !istKana(z) && !SATZZEICHEN.test(z));
  if (!normal(kana).trim()) return 'Lesung fehlt';
  return fremd.length ? `Lesung „${kana}“ enthält andere Zeichen als Kana: ${[...new Set(fremd)].join(' ')}` : null;
}

const liste = (set, max = 12) => {
  const alle = [...set];
  return alle.length > max ? `${alle.slice(0, max).join(', ')} …` : alle.join(', ');
};

/** Bekannte Lesungen einer Kanji-Folge für Fehlermeldungen. */
function bekannteLesungen(text, wb) {
  const zeichen = Array.from(text);
  const ganz = wb.lesungen.get(text);
  if (ganz?.size && zeichen.length > 1) return `${wb.zaehler.has(text) ? 'Zählregel' : 'JMdict'}: ${liste(ganz)}`;
  const stamm = wb.stamm.get(text);
  if (stamm?.size && zeichen.length > 1) return `JMdict (vor Okurigana): ${liste(stamm)}`;
  return `KANJIDIC: ${zeichen.map((z) => `${z} ${liste(wb.kanji.get(z) ?? [], 10) || '?'}`).join('; ')}`;
}

/**
 * Prüft ein Wort: OK, wenn JMdict die Paarung Schreibung + Lesung kennt.
 * Unbekannte Schreibungen sind ein Hinweis; dann wird das Wort wie ein Satz
 * aus Einzelzeichen geprüft, und nur ein Widerspruch dort ist ein Fehler.
 * Ergebnis: { status: 'ok' | 'hinweis' | 'fehler' | 'nicht prüfbar', meldungen }.
 */
function pruefeWort(wort, kana, wb = standardWoerterbuch()) {
  const w = normal(wort).trim();
  const k = zuHiragana(kana).replace(/\s+/g, '');
  const problem = lesungsProblem(kana);
  if (problem) return { status: 'fehler', meldungen: [problem] };
  const bekannt = wb.lesungen.get(w);
  if (bekannt) {
    if (!bekannt.has(k)) return { status: 'fehler', meldungen: [`„${w}“ wird nicht „${k}“ gelesen — JMdict kennt: ${liste(bekannt)}`] };
    if (wb.unueblich.has(w)) return { status: 'hinweis', meldungen: [`„${w}“ ist in JMdict nur Such- oder veraltete Schreibung`] };
    return { status: 'ok', meldungen: [] };
  }
  if (NICHT_PRUEFBAR.test(w)) return { status: 'nicht prüfbar', meldungen: [`„${w}“ enthält Ziffern oder lateinische Buchstaben`] };
  const satz = pruefeSatz(w, kana, wb);
  if (satz.status === 'fehler') return { status: 'fehler', meldungen: [`„${w}“ nicht im Wörterbuch`, ...satz.meldungen] };
  const wie = Array.from(w).some(istKanji) ? ' (aus Einzelzeichen ableitbar)' : '';
  return { status: 'hinweis', meldungen: [`„${w}“ nicht im Wörterbuch${wie}`] };
}

const STIMMHAFT = {
  か: ['が'], き: ['ぎ'], く: ['ぐ'], け: ['げ'], こ: ['ご'], さ: ['ざ'], し: ['じ'], す: ['ず'], せ: ['ぜ'], そ: ['ぞ'],
  た: ['だ'], ち: ['ぢ', 'じ'], つ: ['づ', 'ず'], て: ['で'], と: ['ど'], は: ['ば'], ひ: ['び'], ふ: ['ぶ'], へ: ['べ'], ほ: ['ぼ'],
};
const HALBTRUEB = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

const NAMEN_ENDUNG = /^(さん|くん|ちゃん|さま)/u;
const NAMEN_KANJI = /(様|先生|氏|君)$/u;

/** Steht die Kanji-Folge ab i vor einer Namensendung (渡辺さん, 渡辺様)? */
function vorNamensendung(s, i) {
  let e = i;
  while (e < s.length && istKanji(s[e])) e += 1;
  return NAMEN_ENDUNG.test(s.slice(e, e + 3).join('')) || NAMEN_KANJI.test(s.slice(i, e).join(''));
}

/**
 * Lesungen eines Kanji aus KANJIDIC, im Kompositum mit Rendaku (k→g, s→z,
 * t→d, h→b; h→p nur nach っ/ん) und Sokuon (Endsilbe つ/ち/く/き → っ vor
 * k/s/t/p). 々 wiederholt das Zeichen davor. Namenslesungen nur vor さん usw.
 */
function einzelLesungen(s, i, wb) {
  const z = s[i];
  let basis = wb.kanji.get(z) ?? new Set();
  if (wb.namen.has(z) && vorNamensendung(s, i)) basis = new Set([...basis, ...wb.namen.get(z)]);
  if (z === '々') basis = i > 0 && istKanji(s[i - 1]) ? wb.kanji.get(s[i - 1]) ?? new Set() : new Set();
  if (z === 'ヵ' || z === 'ヶ') basis = new Set(['か', 'が', 'こ']);
  const imKompositum = i > 0 && istKanji(s[i - 1]);
  const vorKanji = i + 1 < s.length && istKanji(s[i + 1]);
  const varianten = [];
  for (const l of basis) {
    const formen = [{ text: l, variante: false, p: false }];
    if (imKompositum || z === '々') {
      for (const t of STIMMHAFT[l[0]] ?? []) formen.push({ text: t + l.slice(1), variante: true, p: false });
      if (HALBTRUEB[l[0]]) formen.push({ text: HALBTRUEB[l[0]] + l.slice(1), variante: true, p: true });
    }
    for (const f of formen) {
      varianten.push({ ...f, sokuon: false });
      if (vorKanji && f.text.length >= 2 && 'つちくき'.includes(f.text.slice(-1))) {
        varianten.push({ ...f, text: `${f.text.slice(0, -1)}っ`, variante: true, sokuon: true });
      }
    }
  }
  return varianten;
}

const VOKAL_VON = new Map([...ROMAJI].map(([k, r]) => [k, r.slice(-1)]));
const VOKAL_KANA = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };

/** Passt ein Kana aus dem Satz an Stelle j der Lesung? ー darf als Vokal ausgeschrieben sein. */
function kanaPasst(z, lesung, j) {
  const h = zuHiragana(z);
  const r = lesung[j];
  if (h === r) return true;
  if (h !== 'ー') return false;
  const v = VOKAL_VON.get(lesung[j - 1]);
  return r === VOKAL_KANA[v] || (v === 'o' && r === 'う') || (v === 'e' && r === 'い');
}

const KOSTEN = { kana: 0, zeichen: 0, wort: 1, stamm: 1, kanji: 3, variante: 4, joker: 1000, jeJokerZeichen: 100, kanaFehler: 5000 };

/**
 * (a) JMdict-Kandidaten ab Satzstelle i: ganze Schreibungen und Stämme vor
 * Okurigana (食べます → 食 = た).
 */
function woerterAb(s, i, wb) {
  const kandidaten = [];
  let text = '';
  let mitKanji = false;
  for (let l = 1; l <= wb.maxLaenge && i + l <= s.length; l += 1) {
    const z = s[i + l - 1];
    if (SATZZEICHEN.test(z)) break;
    text += z;
    mitKanji ||= istKanji(z);
    if (!mitKanji) continue;
    if (wb.lesungen.has(text)) kandidaten.push({ laenge: l, lesungen: wb.lesungen.get(text), art: 'wort' });
    if (istKanji(z) && i + l < s.length && istKana(s[i + l]) && wb.stamm.has(text)) {
      kandidaten.push({ laenge: l, lesungen: wb.stamm.get(text), art: 'stamm' });
    }
  }
  return kandidaten;
}

/** Ausrichtung Satz ↔ Lesung als kürzester Weg (Fehler kosten viel, sind aber immer möglich). */
function richteAus(s, lesung, wb) {
  const n = s.length;
  const m = lesung.length;
  const breite = m + 1;
  const kosten = new Float64Array((n + 1) * breite).fill(Infinity);
  const zurueck = new Array((n + 1) * breite);
  const woerter = s.map((_, i) => woerterAb(s, i, wb));
  const einzeln = s.map((z, i) => (istKanji(z) ? einzelLesungen(s, i, wb) : []));
  kosten[0] = 0;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      const c = kosten[i * breite + j];
      if (c === Infinity) continue;
      const weiter = (i2, j2, plus, art) => {
        const ziel = i2 * breite + j2;
        if (c + plus < kosten[ziel]) { kosten[ziel] = c + plus; zurueck[ziel] = { i, j, art }; }
      };
      if (j < m) weiter(i, j + 1, KOSTEN.kanaFehler, 'zuviel');
      if (i === n) continue;
      const z = s[i];
      // Satzzeichen und fremde Zeichen (♪, ※) tragen keine Lesung.
      if (SATZZEICHEN.test(z) || (!istKana(z) && !istKanji(z))) { weiter(i + 1, j, KOSTEN.zeichen, 'zeichen'); continue; }
      if (istKana(z)) {
        if (j < m && kanaPasst(z, lesung, j)) weiter(i + 1, j + 1, KOSTEN.kana, 'kana');
        else if (j < m) weiter(i + 1, j + 1, KOSTEN.kanaFehler, 'ersetzt');
        weiter(i + 1, j, KOSTEN.kanaFehler, 'fehlt');
      }
      for (const { laenge, lesungen, art } of woerter[i]) {
        for (const r of lesungen) if (lesung.startsWith(r, j)) weiter(i + laenge, j + r.length, KOSTEN[art], art);
      }
      if (!istKanji(z)) continue;
      // (b) KANJIDIC: ein Zeichen, mit Rendaku/Sokuon.
      for (const v of einzeln[i]) {
        if (!lesung.startsWith(v.text, j)) continue;
        const ende = j + v.text.length;
        if (v.sokuon && !/^[かきくけこさしすせそたちつてとぱぴぷぺぽ]/.test(lesung[ende] ?? '')) continue;
        if (v.p && !'っん'.includes(lesung[j - 1] ?? '-')) continue;
        weiter(i + 1, ende, v.variante ? KOSTEN.variante : KOSTEN.kanji, 'kanji');
      }
      // Joker: Kanji-Folge mit beliebigem Lesungsstück = Fehler an dieser Stelle.
      for (let l = 1; i + l <= n && istKanji(s[i + l - 1]); l += 1) {
        for (let k = j; k <= m; k += 1) weiter(i + l, k, KOSTEN.joker + KOSTEN.jeJokerZeichen * l, 'joker');
      }
    }
  }
  const schritte = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const b = zurueck[i * breite + j];
    schritte.unshift({ art: b.art, i: b.i, satz: s.slice(b.i, i).join(''), lesung: lesung.slice(b.j, j) });
    i = b.i;
    j = b.j;
  }
  return schritte;
}

const nurKanji = (text) => Array.from(text).every(istKanji);

/**
 * Kanji-Folgen, die aus mehreren Stücken (mindestens eines ein Einzelzeichen)
 * zusammengesetzt wurden, obwohl JMdict oder die Zählregel die ganze Folge mit
 * anderer Lesung kennt: 上手 じょう+て, 三本 さん+ほん. Kennte das Wörterbuch die
 * zusammengesetzte Lesung, hätte die Ausrichtung das ganze Wort genommen.
 */
function teilFolgenProbleme(schritte, s, wb) {
  const meldungen = [];
  const passt = (t) => ['wort', 'stamm', 'kanji'].includes(t.art) && nurKanji(t.satz);
  for (let a = 0; a < schritte.length;) {
    let e = a;
    while (e < schritte.length && passt(schritte[e])) e += 1;
    if (e - a >= 2) {
      const gruppe = schritte.slice(a, e);
      const letzter = gruppe[gruppe.length - 1];
      const vorKana = istKana(s[letzter.i + Array.from(letzter.satz).length] ?? '');
      const belegt = new Array(gruppe.length).fill(false);
      for (let laenge = gruppe.length; laenge >= 2; laenge -= 1) {
        for (let von = 0; von + laenge <= gruppe.length; von += 1) {
          if (belegt.slice(von, von + laenge).some(Boolean)) continue;
          const teil = gruppe.slice(von, von + laenge);
          const text = teil.map((t) => t.satz).join('');
          const amEnde = von + laenge === gruppe.length;
          if (!wb.lesungen.has(text) && !(amEnde && vorKana && wb.stamm.has(text))) continue;
          // Zwei ganze Mehrzeichen-Wörter nebeneinander (十月 + 十日) sind kein Lesungsfehler.
          if (!teil.some((t) => Array.from(t.satz).length === 1)) continue;
          belegt.fill(true, von, von + laenge);
          const stueck = teil.map((t) => t.lesung).join('');
          const aus = teil.map((t) => `${t.satz}=${t.lesung}`).join(' + ');
          meldungen.push(`„${text}“ gelesen als „${stueck}“, zusammengesetzt aus ${aus}; als Ganzes ${bekannteLesungen(text, wb)}`);
        }
      }
    }
    a = Math.max(e, a + 1);
  }
  return meldungen;
}

const PARTIKEL_HINWEIS = { は: 'わ', へ: 'え', を: 'お' };

function schrittMeldung(t, wb) {
  if (t.art === 'joker') {
    if (!t.lesung) return `„${t.satz}“ hat kein Stück in der Lesung`;
    return `„${t.satz}“ gelesen als „${t.lesung}“ — ${bekannteLesungen(t.satz, wb)}`;
  }
  if (t.art === 'ersetzt') {
    const partikel = PARTIKEL_HINWEIS[zuHiragana(t.satz)] === t.lesung ? ' (Partikel in der Lesung wie geschrieben: は, へ, を)' : '';
    return `Satz hat „${t.satz}“, Lesung an dieser Stelle „${t.lesung}“${partikel}`;
  }
  if (t.art === 'fehlt') return `„${t.satz}“ aus dem Satz fehlt in der Lesung`;
  if (t.art === 'zuviel') return `Lesung hat überzähliges „${t.lesung}“`;
  return null;
}

/** Lesbare Zerlegung: 今日=きょう は 学生=がくせい です (≈ = aus Einzelzeichen). */
function zerlegung(schritte) {
  const teile = [];
  let kana = '';
  for (const t of schritte) {
    if (t.art === 'kana' || t.art === 'zeichen') { kana += t.satz; continue; }
    if (kana) { teile.push(kana); kana = ''; }
    if (t.art === 'wort' || t.art === 'stamm') teile.push(`${t.satz}=${t.lesung}`);
    else if (t.art === 'kanji') teile.push(`${t.satz}≈${t.lesung}`);
    else teile.push(`[${t.satz || '∅'}≠${t.lesung || '∅'}]`);
  }
  if (kana) teile.push(kana);
  return teile.join(' ');
}

/**
 * Prüft einen Satz gegen seine Kana-Lesung. Kana im Satz müssen an passender
 * Stelle der Lesung stehen (Hiragana = Katakana, Satzzeichen und Leerzeichen
 * zählen nicht). Jede Kanji-Folge bekommt ein Stück der Lesung, das (a) JMdict
 * für diese Schreibung oder ihren Stamm vor Okurigana kennt, oder (b) sich aus
 * KANJIDIC-Lesungen der Einzelzeichen zusammensetzt (mit Rendaku/Sokuon).
 * Zusammensetzen gilt nicht, wenn JMdict (oder die Zählregel) die ganze Folge
 * als Wort kennt und anders liest.
 * Ergebnis: { status: 'ok' | 'fehler' | 'nicht prüfbar', meldungen, schritte, zerlegung }.
 */
function pruefeSatz(satz, kana, wb = standardWoerterbuch()) {
  const s = Array.from(normal(satz).trim());
  if (s.some((z) => NICHT_PRUEFBAR.test(z))) {
    return { status: 'nicht prüfbar', meldungen: ['Satz enthält Ziffern oder lateinische Buchstaben'], schritte: [], zerlegung: '' };
  }
  const problem = lesungsProblem(kana);
  if (problem) return { status: 'fehler', meldungen: [problem], schritte: [], zerlegung: '' };
  const lesung = Array.from(zuHiragana(kana)).filter((z) => !SATZZEICHEN.test(z)).join('');
  const roh = richteAus(s, lesung, wb);
  const schritte = [];
  for (const t of roh) {
    const vorher = schritte[schritte.length - 1];
    if (t.art === 'zuviel' && vorher?.art === 'zuviel') vorher.lesung += t.lesung;
    else schritte.push({ ...t });
  }
  const meldungen = [...schritte.map((t) => schrittMeldung(t, wb)).filter(Boolean), ...teilFolgenProbleme(schritte, s, wb)];
  return { status: meldungen.length ? 'fehler' : 'ok', meldungen, schritte, zerlegung: zerlegung(schritte) };
}

/* ---------- TSV ---------- */

const leer = (feld) => !feld || feld === '0';

/** Prüft den Inhalt einer TSV-Datei; gibt Zählung und Ausgabezeilen zurück. */
function pruefeTsv(inhalt, name, wb = standardWoerterbuch()) {
  const zahl = { zeilen: 0, woerter: 0, wortFehler: 0, wortHinweise: 0, saetze: 0, satzFehler: 0, nichtPruefbar: 0 };
  const ausgabe = [];
  inhalt.split('\n').forEach((zeile, n) => {
    if (!zeile.trim() || zeile.startsWith('#')) return;
    zahl.zeilen += 1;
    const [begriff = '', wort = '', kana = '', satz = '', satzkana = ''] = zeile.split('|').map((f) => f.trim());
    const wo = `${name}:${n + 1} ${begriff}`;
    if (wort === '-') return;
    if (!wort || !kana) {
      zahl.wortFehler += 1;
      ausgabe.push(`${wo}: Fehler: Wort oder Lesung fehlt`);
      return;
    }
    zahl.woerter += 1;
    const w = pruefeWort(wort, kana, wb);
    if (w.status === 'fehler') zahl.wortFehler += 1;
    else if (w.status !== 'ok') zahl.wortHinweise += 1;
    if (w.status === 'nicht prüfbar') zahl.nichtPruefbar += 1;
    const art = w.status === 'fehler' ? 'Fehler' : 'Hinweis';
    for (const m of w.meldungen) ausgabe.push(`${wo}: Wort ${art}: ${m}`);
    if (leer(satz) && leer(satzkana)) return;
    zahl.saetze += 1;
    if (leer(satz) || leer(satzkana)) {
      zahl.satzFehler += 1;
      ausgabe.push(`${wo}: Satz Fehler: ${leer(satz) ? 'Lesung ohne Satz' : 'Satz ohne Lesung'}`);
      return;
    }
    const s = pruefeSatz(satz, satzkana, wb);
    if (s.status === 'fehler') zahl.satzFehler += 1;
    if (s.status === 'nicht prüfbar') zahl.nichtPruefbar += 1;
    for (const m of s.meldungen) ausgabe.push(`${wo}: Satz ${s.status === 'fehler' ? 'Fehler' : 'Hinweis'}: ${m} [${satz}]`);
  });
  return { zahl, ausgabe };
}

function pruefeDateien(dateien, wb = standardWoerterbuch()) {
  const summe = { zeilen: 0, woerter: 0, wortFehler: 0, wortHinweise: 0, saetze: 0, satzFehler: 0, nichtPruefbar: 0 };
  for (const datei of dateien) {
    const relativ = path.relative(process.cwd(), datei);
    const { zahl, ausgabe } = pruefeTsv(fs.readFileSync(datei, 'utf8'), relativ.startsWith('..') ? datei : relativ, wb);
    for (const zeile of ausgabe) console.log(zeile);
    for (const k of Object.keys(summe)) summe[k] += zahl[k];
  }
  console.log(`${summe.zeilen} Zeilen: Wörter ${summe.woerter} (${summe.wortFehler} Fehler, ${summe.wortHinweise} Hinweise), `
    + `Sätze ${summe.saetze} (${summe.satzFehler} Fehler), ${summe.nichtPruefbar} nicht prüfbar.`);
  return summe;
}

/* ---------- Aufruf ---------- */

function cli(argumente) {
  const [befehl, ...rest] = argumente;
  if (befehl === 'lade') {
    const start = Date.now();
    const d = baueSpeicher();
    console.log(`${Object.keys(d.lesungen).length} Schreibungen, ${Object.keys(d.kanji).length} Kanji in ${path.relative(ROOT, SPEICHER)} (${((Date.now() - start) / 1000).toFixed(1)} s).`);
    return 0;
  }
  if (befehl === 'romaji' && rest[0]) {
    console.log(kanaZuRomaji(rest.filter((a) => a !== '--satz').join(' '), { satz: rest.includes('--satz') }));
    return 0;
  }
  if (befehl === 'wort' && rest.length === 2) {
    const wb = standardWoerterbuch();
    const e = pruefeWort(rest[0], rest[1], wb);
    console.log(`${e.status}${e.meldungen.length ? `: ${e.meldungen.join(' | ')}` : ''}`);
    console.log(`Romaji: ${wortRomaji(rest[0], rest[1], wb)}`);
    return e.status === 'fehler' ? 1 : 0;
  }
  if (befehl === 'satz' && rest.length === 2) {
    const wb = standardWoerterbuch();
    const e = pruefeSatz(rest[0], rest[1], wb);
    console.log(`${e.status}${e.meldungen.length ? `: ${e.meldungen.join(' | ')}` : ''}`);
    if (e.zerlegung) console.log(`Zerlegung: ${e.zerlegung}`);
    console.log(`Romaji: ${satzRomaji(rest[1], wb)}`);
    return e.status === 'fehler' ? 1 : 0;
  }
  if (befehl === 'pruefe' && rest.length) {
    const summe = pruefeDateien(rest);
    return summe.wortFehler + summe.satzFehler ? 1 : 0;
  }
  console.log('Aufruf: node content-plan/japanisch-lesung.cjs lade | wort <wort> <kana> | satz <satz> <kana> | romaji <kana> [--satz] | pruefe <datei.tsv> …');
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = cli(process.argv.slice(2));
  } catch (fehler) {
    if (fehler.code !== 'WOERTERBUCH_FEHLT') throw fehler;
    console.error(fehler.message);
    process.exitCode = 1;
  }
}

module.exports = {
  zuHiragana, kanaZuRomaji, wortRomaji, satzRomaji,
  leseJmdict, leseKanjidic, woerterbuch, woerterbuchAusXml, mitZaehlern, zaehlLesungen,
  pruefeWort, pruefeSatz, pruefeTsv, pruefeDateien, standardWoerterbuch,
};
