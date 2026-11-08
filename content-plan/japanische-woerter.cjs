#!/usr/bin/env node
/**
 * Japanischer Wortschatz aus dem vorhandenen Bestand (07.11.2026), nach dem
 * Muster von `chinesische-woerter.cjs`.
 *
 * Japanisch ist App-Sprache: Die Bedeutung (`translations.ja`) und die
 * übersetzten Beispielsätze kommen aus dem Bestand der anderen Lernsprachen
 * (dort seit der Übersetzung ins Japanische vorhanden). Wo das japanische
 * Wort enger ist als das der Quellsprache, stehen eigene Bedeutungen in
 * `japanische-bedeutungen.json` (08.11.2026). Von Hand (Claude)
 * kommen Wortwahl, Kana-Lesung, Zählwort und der japanische Beispielsatz mit
 * Lesung. Das Romaji (modifiziertes Hepburn) wird gerechnet, nie geschrieben;
 * die Lesung prüft `japanisch-lesung.cjs` gegen JMdict und KANJIDIC2.
 *
 *   node content-plan/japanische-woerter.cjs dateien
 *   node content-plan/japanische-woerter.cjs zeige <stufe>-<nnnn>
 *   node content-plan/japanische-woerter.cjs pruefe [<stufe>-<nnnn> …]
 *     nur Lesung, Zählwort und Satz; braucht die Übersetzungen noch nicht
 *   node content-plan/japanische-woerter.cjs baue [<stufe>-<nnnn> …]
 *     liest _Local/woerter/ja/tsv/*.tsv (oder nur die genannten), schreibt
 *     _Local/woerter/ja/*.json.
 *     Danach: node content-plan/pruefe-woerter.cjs _Local/woerter/ja
 *
 * TSV-Zeile (Felder mit „|“, „#“ am Zeilenanfang = Kommentar):
 *   begriff   ohne „c:“
 *   wort      übliche Schreibung (Kanji wie im Wörterbuch, sonst Kana;
 *             Lehnwörter in Katakana); Verben in Wörterbuchform (食べる),
 *             い-Adjektive auf い, な-Adjektive ohne な (静か);
 *             „-“ = Begriff auslassen (gleiches Wort steht schon unter einem
 *             anderen Begriff, oder es gibt im Japanischen keins)
 *   kana      Lesung in Hiragana (Katakana-Wörter in Katakana)
 *   zaehler   Nomen: Zählwort aus ZAEHLER, Alternativen mit „/“ („本/つ“);
 *             „0“ = keins (Stoffe, Abstrakta, Orte, Zeitwörter, Namen).
 *             „-:<wortart>“ = im Japanischen eine andere Wortart. Sonst leer.
 *   satz      „#n <japanischer Satz>“: eigene japanische Fassung von Satz n
 *             aus `zeige` (die anderen Sprachen kommen von Satz n); „0“ = keiner
 *   satzkana  Lesung des Satzes in Kana, Wörter mit Leerzeichen getrennt,
 *             Partikel wie geschrieben (は, へ, を), Satzzeichen wie im Satz
 *             („わたし は みず を のみます。“); „0“, wenn kein Satz
 */
const fs = require('node:fs');
const path = require('node:path');
const lesung = require('./japanisch-lesung.cjs');

const ROOT = path.resolve(__dirname, '..');
const STUFEN = ['beginner', 'experienced', 'pro'];
const JE_DATEI = 50;
// generatedAt = Begriffsrang wie bei den anderen Sprachen (24.10.2026, 15:00 UTC + Rang in Sekunden).
const RANG_BASIS = 1792854000000;
// Die alten zehn App-Sprachen zählen die Sätze (stabile Nummern, auch bevor ja/it übernommen sind).
const UI_ALT = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt'];
const UI = [...UI_ALT, 'it', 'ja'];
const QUELLEN = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'th'];
const VERMERK = 'KI-Erzeugung (Claude) aus den Bedeutungen und Beispielsätzen der anderen Lernsprachen; Wortwahl, Kana-Lesung, Zählwort und Satz von Claude, Lesung gegen JMdict/KANJIDIC2 geprüft, Romaji gerechnet.';
const ORDNER = path.join(ROOT, '_Local/woerter/ja');
// Eigene Bedeutungen, wo das japanische Wort enger ist als das Wort der
// Quellsprache (泊まる heißt „übernachten“, nicht „bleiben“; 疲れる „müde
// werden“, nicht „müde“). Schlüssel = Begriff ohne „c:“, je App-Sprache außer ja.
const EIGENE_BEDEUTUNGEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'japanische-bedeutungen.json'), 'utf8'));

/**
 * Zählwörter, die die Übung „つ, 本 oder 枚?“ kennt — dieselbe Liste wie
 * `src/data/japanese-counters.ts` (der Test dort vergleicht beide).
 */
const ZAEHLER = ['つ', '個', '本', '枚', '冊', '匹', '頭', '羽', '台', '人', '杯', '足', '着', '軒', '通', '輪', '粒', '機', '隻', '脚', '部', '曲', '棟', '膳', '丁', '件', '皿'];

const KANA = /[぀-ヿ]/u;
const KANJI = /\p{Script=Han}/u;
const NUR_KANA_ZEICHEN = /^[぀-ヿー\s。、！？!?「」・〜…]+$/u;

/* ---------- Bestand ---------- */

/**
 * Romaji eines Stichworts mit Leerzeichen zwischen den Teilen (07.11.2026):
 * する-Verben „shuppatsu suru“, Partikeln zwischen Kanji/Katakana als eigenes
 * Wort („nodo ga kawaku“, „kudamono no ki“), „arigatō gozaimasu“. Die Teile
 * der Kana-Lesung findet ein Muster aus der Schreibung: Kanji-/Katakana-Folgen
 * stehen für beliebige Kana, Hiragana für sich selbst.
 */
const PARTIKELN = new Set(['が', 'を', 'に', 'の', 'は', 'で', 'と', 'も', 'へ']);
function wortUmschrift(wort, kana, wb) {
  const hira = lesung.zuHiragana(kana).replace(/\s+/g, '');
  const istHira = (z) => /[\u3041-\u309f]/u.test(z);
  // Teile der Schreibung: Nicht-Hiragana-Folgen und einzelne Hiragana.
  const teile = [];
  for (const z of Array.from(wort.replace(/\s+/g, ''))) {
    if (!istHira(z) && teile.length && teile[teile.length - 1].art === 'fremd') teile[teile.length - 1].text += z;
    else teile.push({ art: istHira(z) ? 'hira' : 'fremd', text: z });
  }
  // Alle Zuordnungen der Lesung zu den Teilen; bevorzugt die, deren Kanji-Teile das Wörterbuch so liest.
  const zuordnungen = [];
  const suche = (n, rest, bisher) => {
    if (zuordnungen.length > 50) return;
    if (n === teile.length) { if (!rest) zuordnungen.push(bisher); return; }
    const t = teile[n];
    if (t.art === 'hira') { if (rest.startsWith(t.text)) suche(n + 1, rest.slice(t.text.length), [...bisher, t.text]); return; }
    for (let l = 1; l <= rest.length; l += 1) suche(n + 1, rest.slice(l), [...bisher, rest.slice(0, l)]);
  };
  suche(0, hira, []);
  const passt = (z) => teile.every((t, n) => t.art === 'hira' || /[\u30a0-\u30ff]/u.test(t.text)
    || lesung.pruefeWort(t.text, z[n], wb).status !== 'fehler');
  const wahl = zuordnungen.find(passt) ?? (zuordnungen.length === 1 ? zuordnungen[0] : null);
  let getrennt = hira;
  if (wahl) {
    const woerter = [''];
    teile.forEach((t, n) => {
      const naechstes = teile[n + 1];
      const partikel = t.art === 'hira' && n > 0 && naechstes
        && (t.text === 'を' || (PARTIKELN.has(t.text) && naechstes.art === 'fremd'));
      if (partikel) { woerter.push(wahl[n], ''); return; }
      woerter[woerter.length - 1] += wahl[n];
    });
    getrennt = woerter.filter(Boolean).join(' ');
  }
  getrennt = getrennt.replace(/^(.+?) ?する$/u, '$1 する').replace(/^(.+?) ?ございます$/u, '$1 ございます').replace(/^(.+?) ?です$/u, '$1 です');
  if (!getrennt.includes(' ')) return lesung.wortRomaji(wort, kana, wb);
  const alle = getrennt.split(' ').filter(Boolean);
  return alle.map((teil, n) => {
    if (teil === 'は') return 'wa';
    if (teil === 'へ') return 'e';
    // Nur das letzte Teil kann ein Verb auf -u sein (思う, 言う).
    return n === alle.length - 1 ? lesung.wortRomaji(teil, teil, wb) : lesung.kanaZuRomaji(teil);
  }).join(' ');
}

function begriffe() {
  const alle = JSON.parse(fs.readFileSync(path.join(__dirname, 'begriffe.json'), 'utf8')).begriffe;
  return alle.map((b, rang) => ({ ...b, rang })).filter((b) => !b.onlyLanguages || b.onlyLanguages.includes('ja'));
}

function dateien() {
  const liste = begriffe();
  const je = new Map();
  for (const stufe of STUFEN) {
    const teil = liste.filter((b) => b.stage === stufe);
    for (let i = 0; i < teil.length; i += JE_DATEI) {
      je.set(`${stufe}-${String(i / JE_DATEI + 1).padStart(4, '0')}`, teil.slice(i, i + JE_DATEI));
    }
  }
  return je;
}

function woerterJeBegriff() {
  const katalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'));
  const je = new Map();
  for (const eintrag of katalog.entries) {
    if (eintrag.kind !== 'vocabulary') continue;
    const d = eintrag.document;
    if (!d.concept || !QUELLEN.includes(d.language)) continue;
    if (!je.has(d.concept)) je.set(d.concept, []);
    je.get(d.concept).push(d);
  }
  for (const liste of je.values()) liste.sort((a, b) => QUELLEN.indexOf(a.language) - QUELLEN.indexOf(b.language));
  return je;
}

/** Vollständig übersetzte Beispielsätze der anderen Lernsprachen (ohne doppelte englische Fassung). */
function saetze(docs) {
  const gesehen = new Set();
  const liste = [];
  for (const d of docs) {
    const t = d.exampleTranslations;
    if (!t || !UI_ALT.every((ui) => typeof t[ui] === 'string' && t[ui].trim())) continue;
    if (gesehen.has(t.en)) continue;
    gesehen.add(t.en);
    liste.push(t);
  }
  return liste;
}

function zeige(name) {
  const teil = dateien().get(name);
  if (!teil) throw Error(`Unbekannte Datei ${name}`);
  const je = woerterJeBegriff();
  for (const b of teil) {
    const docs = je.get(b.id) ?? [];
    const de = docs.find((d) => d.language === 'de');
    const deWort = de ? (de.germanNoun ? `${de.germanNoun.article} ${de.term}` : de.term) : docs[0]?.german;
    const zh = docs.find((d) => d.language === 'zh')?.term;
    const ja = [...new Set(docs.map((d) => d.translations?.ja).filter(Boolean))];
    const liste = saetze(docs);
    const info = liste.length ? liste.map((s, n) => `#${n + 1} ${s.en}`).join(' ') : 'KEIN SATZ';
    console.log(`${b.id.slice(2)} ${b.partOfSpeech} „${b.en}“ = ${deWort}${zh ? ` · zh ${zh}` : ''}${ja.length ? ` · ja? ${ja.join(' / ')}` : ''} | ${info}`);
  }
}

function bedeutungen(docs, wort, eigene) {
  const translations = {};
  for (const ui of UI) {
    const text = ui === 'ja' ? wort : eigene ? eigene[ui] : docs.map((d) => d.translations?.[ui]).find((t) => typeof t === 'string' && t.trim());
    if (text) translations[ui] = text;
  }
  return translations;
}

/**
 * Enthält der Satz das Wort? Verben und Adjektive werden gebeugt (食べる →
 * 食べます, 高い → 高くて), deshalb genügt der Stamm vor dem letzten Kana.
 */
function satzHatWort(satz, wort, kana) {
  if (satz.includes(wort)) return true;
  const stamm = KANJI.test(wort) ? wort.replace(/[぀-ゟ]+$/u, '') : wort.slice(0, -1);
  if (stamm && satz.includes(stamm)) return true;
  return Boolean(kana) && satz.includes(kana.slice(0, -1));
}

function verarbeite(nur, { schreiben }) {
  const tsv = path.join(ORDNER, 'tsv');
  const je = woerterJeBegriff();
  const plan = dateien();
  const wb = lesung.standardWoerterbuch();
  const offen = [];
  const hinweise = [];
  let anzahl = 0;
  let ohneSatz = 0;
  const verwendet = new Set();
  fs.mkdirSync(ORDNER, { recursive: true });
  const alle = fs.readdirSync(tsv).filter((f) => f.endsWith('.tsv')).sort();
  for (const datei of nur.length ? alle.filter((f) => nur.includes(f.replace(/\.tsv$/, ''))) : alle) {
    const name = datei.replace(/\.tsv$/, '');
    const erwartet = plan.get(name);
    if (!erwartet) throw Error(`${datei}: kein Dateiname aus dem Plan`);
    const info = new Map(erwartet.map((b) => [b.id, b]));
    const eintraege = [];
    const gesehen = new Set();
    for (const zeile of fs.readFileSync(path.join(tsv, datei), 'utf8').split('\n')) {
      if (!zeile.trim() || zeile.startsWith('#')) continue;
      const [roh, wortRoh = '', kanaRoh = '', zaehlRoh = '', satzRoh = '', satzKanaRoh = ''] = zeile.split('|').map((z) => z.trim());
      const begriff = `c:${roh}`;
      const b = info.get(begriff);
      const wo = `${datei}: ${roh}`;
      if (!b) { offen.push(`${wo} gehört nicht in diese Datei`); continue; }
      if (gesehen.has(begriff)) { offen.push(`${wo} doppelt`); continue; }
      gesehen.add(begriff);
      const wort = wortRoh.normalize('NFC');
      if (wort === '-') continue;
      if (!wort || !kanaRoh) { offen.push(`${wo} ohne Wort oder Kana`); continue; }
      if (!KANA.test(wort) && !KANJI.test(wort)) { offen.push(`${wo} „${wort}“ ist nicht japanisch geschrieben`); continue; }
      const kana = kanaRoh.normalize('NFC').replace(/\s+/g, '');
      if (!NUR_KANA_ZEICHEN.test(kana)) { offen.push(`${wo} Lesung „${kana}“ ist nicht nur Kana`); continue; }
      const pruefung = lesung.pruefeWort(wort, kana, wb);
      if (pruefung.status === 'fehler') { offen.push(`${wo} ${pruefung.meldungen.join('; ')}`); continue; }
      if (pruefung.status === 'hinweis') hinweise.push(`${wo} ${pruefung.meldungen.join('; ')}`);
      const docs = je.get(begriff) ?? [];
      const en = docs.find((d) => d.language === 'en');
      const eigene = EIGENE_BEDEUTUNGEN[roh];
      if (eigene) {
        verwendet.add(roh);
        const fehlt = UI.filter((ui) => ui !== 'ja' && !eigene[ui]?.trim());
        if (fehlt.length) { offen.push(`${wo} eigene Bedeutung ohne ${fehlt.join(', ')}`); continue; }
      }
      const doc = {
        id: `ki-ja-${roh.replace(/_/g, '-')}`,
        language: 'ja',
        concept: begriff,
        learningStage: b.stage,
        generatedAt: RANG_BASIS + b.rang * 1000,
        term: wort,
        romanization: wortUmschrift(wort, kana, wb),
        kana,
        syllables: [],
        german: eigene?.de ?? en?.german ?? docs.find((d) => d.german)?.german ?? wort,
        translations: bedeutungen(docs, wort, eigene),
        partOfSpeech: b.partOfSpeech,
        register: en?.register ?? docs[0]?.register ?? 'neutral',
        isConcrete: b.isConcrete,
        sourceVerified: false,
        verificationNote: VERMERK,
      };
      const wendung = /^-:([a-z]+)$/.exec(zaehlRoh);
      if (wendung) doc.partOfSpeech = wendung[1];
      else if (doc.partOfSpeech === 'noun') {
        if (!zaehlRoh) { offen.push(`${wo} Nomen ohne Zählwort („0“ = keins)`); continue; }
        if (zaehlRoh !== '0') {
          const [counter, ...alternatives] = zaehlRoh.split('/').map((z) => z.trim()).filter(Boolean);
          const fremd = [counter, ...alternatives].filter((z) => !ZAEHLER.includes(z));
          if (fremd.length) { offen.push(`${wo} Zählwort ${fremd.join(', ')} nicht in der Liste (${ZAEHLER.join(' ')})`); continue; }
          doc.japaneseNoun = { counter, ...(alternatives.length ? { alternatives } : {}) };
        }
      } else if (zaehlRoh) { offen.push(`${wo} Zählwort nur bei Nomen`); continue; }
      const liste = saetze(docs);
      if (satzRoh === '0' || !satzRoh) {
        ohneSatz += 1;
        if (!satzRoh && liste.length) offen.push(`${wo} ohne Satzangabe („0“ = keiner)`);
        eintraege.push(doc);
        continue;
      }
      const m = /^#(\d+)\s+(.+)$/.exec(satzRoh);
      if (!m) { offen.push(`${wo} Satzangabe „${satzRoh}“: erwartet „#n <japanischer Satz>“ oder „0“`); continue; }
      const quelle = liste[Number(m[1]) - 1];
      if (!quelle) { offen.push(`${wo} Quellsatz ${m[1]} fehlt`); continue; }
      const satz = m[2].normalize('NFC');
      if (!KANA.test(satz) && !KANJI.test(satz)) { offen.push(`${wo} Satz ist nicht japanisch: ${satz}`); continue; }
      if (!satzKanaRoh || satzKanaRoh === '0') { offen.push(`${wo} Satz ohne Lesung: ${satz}`); continue; }
      const satzKana = satzKanaRoh.normalize('NFC').replace(/\s+/g, ' ');
      const satzPruefung = lesung.pruefeSatz(satz, satzKana, wb);
      if (satzPruefung.status === 'fehler') { offen.push(`${wo} Satz „${satz}“: ${satzPruefung.meldungen.join('; ')}`); continue; }
      if (!satzHatWort(satz, wort, kana)) hinweise.push(`${wo} Satz enthält „${wort}“ nicht: ${satz}`);
      const texte = Object.fromEntries(UI.map((ui) => [ui, quelle[ui]]));
      texte.ja = satz;
      if (schreiben) {
        const fehlend = UI.filter((ui) => typeof texte[ui] !== 'string' || !texte[ui].trim());
        if (fehlend.length) { offen.push(`${wo} Satz ${m[1]} noch ohne ${fehlend.join(', ')} (Übersetzung übernehmen)`); continue; }
        const ohneBedeutung = UI.filter((ui) => !doc.translations[ui]);
        if (ohneBedeutung.length) { offen.push(`${wo} Bedeutung fehlt für ${ohneBedeutung.join(', ')}`); continue; }
      }
      doc.exampleTerm = satz;
      doc.exampleRoman = lesung.satzRomaji(satzKana, wb);
      doc.exampleKana = satzKana;
      doc.exampleGerman = texte.de;
      doc.exampleTranslations = texte;
      eintraege.push(doc);
    }
    for (const b of erwartet) if (!gesehen.has(b.id)) offen.push(`${datei}: ${b.id.slice(2)} fehlt`);
    if (schreiben) fs.writeFileSync(path.join(ORDNER, `${name}.json`), `${JSON.stringify(eintraege, null, 1)}\n`);
    anzahl += eintraege.length;
  }
  if (!nur.length) {
    for (const roh of Object.keys(EIGENE_BEDEUTUNGEN)) if (!verwendet.has(roh)) offen.push(`japanische-bedeutungen.json: ${roh} hat kein japanisches Wort`);
  }
  console.log(`${anzahl} Einträge ${schreiben ? 'geschrieben' : 'geprüft'} (${ohneSatz} ohne Beispielsatz), ${offen.length} offen, ${hinweise.length} Hinweise.`);
  for (const o of offen) console.log(`  ${o}`);
  for (const h of hinweise) console.log(`  Hinweis: ${h}`);
  if (offen.length) process.exitCode = 1;
}

module.exports = { ZAEHLER, satzHatWort, dateien, wortUmschrift };

if (require.main === module) {
  const [befehl, argument] = process.argv.slice(2);
  if (befehl === 'zeige' && argument) zeige(argument);
  else if (befehl === 'pruefe') verarbeite(process.argv.slice(3), { schreiben: false });
  else if (befehl === 'baue') verarbeite(process.argv.slice(3), { schreiben: true });
  else if (befehl === 'dateien') for (const [name, teil] of dateien()) console.log(name, teil.length);
  else {
    console.error('Aufruf: japanische-woerter.cjs dateien | zeige <datei> | pruefe [<datei> …] | baue [<datei> …]');
    process.exitCode = 1;
  }
}
