#!/usr/bin/env node
/**
 * Chinesischer Wortschatz (Hochchinesisch, Kurzzeichen) aus dem vorhandenen
 * Bestand (07.11.2026), nach dem Muster von `romanische-woerter.cjs`.
 *
 * Chinesisch ist App-Sprache: Für jeden Begriff stehen die Bedeutung
 * (`translations.zh`) und meist ein übersetzter Beispielsatz
 * (`exampleTranslations.zh`) schon im Bestand der anderen Lernsprachen. Von
 * Hand (Claude) kommen Wortwahl, Pinyin, Zählwort und das Pinyin des Satzes.
 *
 *   node content-plan/chinesische-woerter.cjs dateien
 *   node content-plan/chinesische-woerter.cjs zeige <stufe>-<nnnn>
 *   node content-plan/chinesische-woerter.cjs baue [<stufe>-<nnnn> …]
 *     liest _Local/woerter/zh/tsv/*.tsv (oder nur die genannten), schreibt
 *     _Local/woerter/zh/*.json.
 *     Danach: node content-plan/pruefe-woerter.cjs _Local/woerter/zh
 *
 * TSV-Zeile (Felder mit „|“, „#“ am Zeilenanfang = Kommentar):
 *   begriff     ohne „c:“
 *   wort        Kurzzeichen; „-“ = Begriff auslassen (gleiches Wort steht schon
 *               unter einem anderen Begriff)
 *   pinyin      mit Tonzeichen, Silben mit „.“, Wörter mit Leerzeichen
 *               („péng.you“, „zǎo.shang hǎo“); neutraler Ton ohne Zeichen.
 *               Je Schriftzeichen genau eine Silbe.
 *   zaehlwort   Nomen: Zählwort, Alternativen mit „/“ („杯/瓶“); „0“ = keins
 *               (Stoffe, Abstrakta, Namen). „-:<wortart>“ = im Chinesischen
 *               eine andere Wortart (z. B. „-:verb“). Sonst leer.
 *   satz        leer = erster Satz, der das Wort enthält; „#n“ = Satz n;
 *               „#n <eigener Satz>“ = eigene chinesische Fassung von Satz n
 *               (ersetzt dessen zh-Übersetzung); „0“ = keiner
 *   satzpinyin  Pinyin des chinesischen Satzes, Wörter mit Leerzeichen,
 *               Satzzeichen wie im Satz („Wǒ hē shuǐ.“); leer, wenn kein Satz
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STUFEN = ['beginner', 'experienced', 'pro'];
const JE_DATEI = 50;
// generatedAt = Begriffsrang wie bei den anderen Sprachen (24.10.2026, 15:00 UTC + Rang in Sekunden).
const RANG_BASIS = 1792854000000;
const UI = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt'];
const QUELLEN = ['en', 'es', 'fr', 'de', 'th', 'pt', 'it'];
const VERMERK = 'KI-Erzeugung (Claude) aus den Bedeutungen und Beispielsätzen der anderen Lernsprachen; Wortwahl, Pinyin und Zählwort von Claude.';
const HAN = /\p{Script=Han}/gu;

/* ---------- Pinyin ---------- */

const ANLAUTE = {
  '': 'a o e ai ei ao ou an en ang eng er yi ya yo ye yao you yan yin yang ying yong wu wa wo wai wei wan wen wang weng yu yue yuan yun',
  b: 'a o ai ei ao an en ang eng i ie iao ian in ing u',
  p: 'a o ai ei ao ou an en ang eng i ie iao ian in ing u',
  m: 'a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u',
  f: 'a o ei ou an en ang eng u',
  d: 'a e ai ei ao ou an en ang eng ong i ia ie iao iu ian ing u uo ui uan un',
  t: 'a e ai ao ou an ang eng ong i ie iao ian ing u uo ui uan un',
  n: 'a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan ü üe un',
  l: 'a o e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un ü üe',
  g: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  k: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  h: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  j: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  q: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  x: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  zh: 'a e i ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  ch: 'a e i ai ao ou an en ang eng ong u ua uo uai ui uan un uang',
  sh: 'a e i ai ei ao ou an en ang eng u ua uo uai ui uan un uang',
  r: 'e i ao ou an en ang eng ong u ua uo ui uan un',
  z: 'a e i ai ei ao ou an en ang eng ong u uo ui uan un',
  c: 'a e i ai ao ou an en ang eng ong u uo ui uan un',
  s: 'a e i ai ao ou an en ang eng ong u uo ui uan un',
};
const SILBEN = new Set(Object.entries(ANLAUTE).flatMap(([anlaut, reime]) => reime.split(' ').map((reim) => anlaut + reim)));

const TONZEICHEN = { ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü' };
const ohneTon = (text) => Array.from(text.normalize('NFC')).map((z) => TONZEICHEN[z] ?? z).join('');

/** Prüft eine Silbe: gültig, höchstens ein Tonzeichen, auf dem richtigen Vokal. */
function silbenProblem(silbe) {
  const s = silbe.normalize('NFC').toLowerCase();
  const basis = ohneTon(s);
  if (!SILBEN.has(basis) && !(basis.endsWith('r') && SILBEN.has(basis.slice(0, -1)))) return `„${silbe}“ ist keine Pinyin-Silbe`;
  const zeichen = Array.from(s);
  const marken = zeichen.map((z, i) => (TONZEICHEN[z] ? i : -1)).filter((i) => i >= 0);
  if (marken.length > 1) return `„${silbe}“ hat mehrere Tonzeichen`;
  if (!marken.length) return null;
  const b = Array.from(basis.endsWith('r') && !SILBEN.has(basis) ? basis.slice(0, -1) : basis);
  const soll = b.indexOf('a') >= 0 ? b.indexOf('a')
    : b.indexOf('e') >= 0 ? b.indexOf('e')
    : b.join('').includes('ou') ? b.indexOf('o')
    : Math.max(...['i', 'o', 'u', 'ü'].map((v) => b.lastIndexOf(v)));
  return marken[0] === soll ? null : `„${silbe}“: Tonzeichen auf dem falschen Vokal`;
}

/** Zerlegt ein zusammengeschriebenes Pinyin-Wort in Silben (mit Rückverfolgung). */
function zerlege(wort) {
  const teile = wort.split(/['’]/).filter(Boolean);
  const ergebnis = [];
  for (const teil of teile) {
    const basis = ohneTon(teil.toLowerCase());
    const weg = (ab) => {
      if (ab === basis.length) return [];
      // Erhua-r am Wortende (哪儿 nǎr, 一点儿 yìdiǎnr).
      if (ab === basis.length - 1 && basis[ab] === 'r' && ab > 0) return ['r'];
      for (let laenge = Math.min(6, basis.length - ab); laenge >= 1; laenge -= 1) {
        if (!SILBEN.has(basis.slice(ab, ab + laenge))) continue;
        const rest = weg(ab + laenge);
        if (rest) return [Array.from(teil).slice(ab, ab + laenge).join(''), ...rest];
      }
      return null;
    };
    const silben = weg(0);
    if (!silben) return null;
    ergebnis.push(...silben);
  }
  return ergebnis;
}

/** Silbenzahl eines Pinyin-Satzes, oder Fehlermeldung. */
function satzSilben(pinyin) {
  const woerter = pinyin.normalize('NFC').replace(/[.,!?;:"“”()…，。？！：；、《》—–-]/g, ' ').split(/\s+/).filter(Boolean);
  let anzahl = 0;
  for (const w of woerter) {
    const silben = zerlege(w);
    if (!silben) return { fehler: `„${w}“ lässt sich nicht in Pinyin-Silben zerlegen` };
    for (const s of silben) {
      // Das Erhua-r steht schon als eigenes Stück in `silben` (für 儿).
      if (s === 'r') continue;
      const p = silbenProblem(s);
      if (p) return { fehler: p };
    }
    anzahl += silben.length;
  }
  return { anzahl };
}

/** Wort-Pinyin „péng.you“ → Silben und Wörterbuchform „péngyou“ (mit ’ vor a/o/e). */
function wortPinyin(roh) {
  const woerter = roh.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const silben = [];
  const form = woerter.map((w) => {
    const teile = w.split('.').filter(Boolean);
    silben.push(...teile);
    return teile.reduce((text, s) => (text && /^[aoeāáǎàōóǒòēéěè]/.test(s) ? `${text}'${s}` : text + s), '');
  });
  return { silben, form: form.join(' ') };
}

/* ---------- Bestand ---------- */

function begriffe() {
  const alle = JSON.parse(fs.readFileSync(path.join(__dirname, 'begriffe.json'), 'utf8')).begriffe;
  return alle.map((b, rang) => ({ ...b, rang })).filter((b) => !b.onlyLanguages || b.onlyLanguages.includes('zh'));
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

/** Vollständig übersetzte Beispielsätze der anderen Lernsprachen (ohne doppelte zh-Fassung). */
function saetze(docs) {
  const gesehen = new Set();
  const liste = [];
  for (const d of docs) {
    const t = d.exampleTranslations;
    if (!t || !UI.every((ui) => typeof t[ui] === 'string' && t[ui].trim())) continue;
    if (gesehen.has(t.zh)) continue;
    gesehen.add(t.zh);
    liste.push(t);
  }
  return liste;
}

const grundform = (text) => String(text ?? '').normalize('NFC').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();

function zeige(name) {
  const teil = dateien().get(name);
  if (!teil) throw Error(`Unbekannte Datei ${name}`);
  const je = woerterJeBegriff();
  for (const b of teil) {
    const docs = je.get(b.id) ?? [];
    const de = docs.find((d) => d.language === 'de');
    const deWort = de ? (de.germanNoun ? `${de.germanNoun.article} ${de.term}` : de.term) : docs[0]?.german;
    const stimmen = new Map();
    for (const d of docs) {
      const f = grundform(d.translations?.zh);
      if (f) stimmen.set(f, (stimmen.get(f) ?? 0) + 1);
    }
    const kandidaten = [...stimmen.entries()].sort((x, y) => y[1] - x[1]).map(([w]) => w);
    const liste = saetze(docs);
    const info = liste.length
      ? liste.map((s, n) => `#${n + 1}${kandidaten[0] && s.zh.includes(kandidaten[0]) ? '*' : ''} ${s.zh}`).join(' ')
      : 'KEIN SATZ';
    console.log(`${b.id.slice(2)} ${b.partOfSpeech} „${b.en}“ = ${deWort} | ${kandidaten.join(' / ') || '-'} | ${info}`);
  }
}

function bedeutungen(docs, wort) {
  const translations = {};
  for (const ui of UI) {
    const text = ui === 'zh' ? wort : docs.map((d) => d.translations?.[ui]).find((t) => typeof t === 'string' && t.trim());
    if (text) translations[ui] = text;
  }
  return translations;
}

function baue(nur = []) {
  const ziel = path.join(ROOT, '_Local/woerter/zh');
  const tsv = path.join(ziel, 'tsv');
  const je = woerterJeBegriff();
  const plan = dateien();
  const offen = [];
  let anzahl = 0;
  let ohneSatz = 0;
  fs.mkdirSync(ziel, { recursive: true });
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
      const [roh, wortRoh = '', pinyinRoh = '', zaehlRoh = '', satzRoh = '', satzPinyinRoh = ''] = zeile.split('|').map((z) => z.trim());
      const begriff = `c:${roh}`;
      const b = info.get(begriff);
      const wo = `${datei}: ${roh}`;
      if (!b) { offen.push(`${wo} gehört nicht in diese Datei`); continue; }
      if (gesehen.has(begriff)) { offen.push(`${wo} doppelt`); continue; }
      gesehen.add(begriff);
      const wort = wortRoh.normalize('NFC');
      if (wort === '-') continue;
      if (!wort || !pinyinRoh) { offen.push(`${wo} ohne Wort oder Pinyin`); continue; }
      if (/^(#|0$)/.test(zaehlRoh) && b.partOfSpeech !== 'noun') { offen.push(`${wo} Satzangabe in falscher Spalte`); continue; }
      const { silben, form } = wortPinyin(pinyinRoh);
      const zeichen = (wort.match(HAN) ?? []).length;
      const problem = silben.map(silbenProblem).find(Boolean);
      if (problem) { offen.push(`${wo} ${problem}`); continue; }
      const erhua = silben.filter((s) => /r$/.test(ohneTon(s)) && !SILBEN.has(ohneTon(s))).length;
      if (silben.length + erhua !== zeichen) { offen.push(`${wo} „${wort}“ hat ${zeichen} Zeichen, aber ${silben.length} Silben`); continue; }
      const docs = je.get(begriff) ?? [];
      const en = docs.find((d) => d.language === 'en');
      const doc = {
        id: `ki-zh-${roh.replace(/_/g, '-')}`,
        language: 'zh',
        concept: begriff,
        learningStage: b.stage,
        generatedAt: RANG_BASIS + b.rang * 1000,
        term: wort,
        romanization: form,
        syllables: silben.map((s) => ({ roman: s })),
        german: en?.german ?? docs.find((d) => d.german)?.german ?? wort,
        translations: bedeutungen(docs, wort),
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
          const [measureWord, ...alternatives] = zaehlRoh.split('/').map((z) => z.trim()).filter(Boolean);
          doc.chineseNoun = { measureWord, ...(alternatives.length ? { alternatives } : {}) };
        }
      } else if (zaehlRoh) { offen.push(`${wo} Zählwort nur bei Nomen`); continue; }
      const liste = saetze(docs);
      let satz = null;
      let eigener = null;
      if (satzRoh === '0') satz = null;
      else if (/^#\d+\s+\S/.test(satzRoh)) {
        const m = /^#(\d+)\s+(.+)$/.exec(satzRoh);
        satz = liste[Number(m[1]) - 1] ?? null;
        eigener = m[2].normalize('NFC');
        if (!satz) offen.push(`${wo} Quellsatz ${m[1]} fehlt`);
      } else if (/^#\d+$/.test(satzRoh)) {
        satz = liste[Number(satzRoh.slice(1)) - 1] ?? null;
        if (!satz) offen.push(`${wo} Satz ${satzRoh} fehlt`);
      } else if (!satzRoh) satz = liste.find((s) => s.zh.includes(wort)) ?? null;
      else { offen.push(`${wo} Satzangabe „${satzRoh}“ unbekannt`); continue; }
      if (satz) {
        const texte = Object.fromEntries(UI.map((ui) => [ui, satz[ui]]));
        if (eigener) texte.zh = eigener;
        if (!satzPinyinRoh) { offen.push(`${wo} Satz ohne Pinyin: ${texte.zh}`); continue; }
        const satzZeichen = (texte.zh.match(HAN) ?? []).length;
        const gezaehlt = satzSilben(satzPinyinRoh);
        if (gezaehlt.fehler) { offen.push(`${wo} Satz-Pinyin: ${gezaehlt.fehler}`); continue; }
        // Ziffern oder lateinische Buchstaben im Satz: Silben lassen sich nicht abzählen.
        if (!/[0-9A-Za-z]/.test(texte.zh) && gezaehlt.anzahl !== satzZeichen) {
          offen.push(`${wo} Satz „${texte.zh}“ hat ${satzZeichen} Zeichen, aber ${gezaehlt.anzahl} Pinyin-Silben`);
          continue;
        }
        if (!texte.zh.includes(wort)) offen.push(`${wo} Satz enthält „${wort}“ nicht: ${texte.zh}`);
        doc.exampleTerm = texte.zh;
        doc.exampleRoman = satzPinyinRoh.normalize('NFC');
        doc.exampleGerman = texte.de;
        doc.exampleTranslations = texte;
      } else {
        ohneSatz += 1;
        if (satzRoh !== '0' && liste.length) offen.push(`${wo} „${wort}“ ohne Satz — ${liste.map((x, n) => `#${n + 1} ${x.zh}`).join(' ')}`);
      }
      eintraege.push(doc);
    }
    for (const b of erwartet) if (!gesehen.has(b.id)) offen.push(`${datei}: ${b.id.slice(2)} fehlt`);
    fs.writeFileSync(path.join(ziel, `${name}.json`), `${JSON.stringify(eintraege, null, 1)}\n`);
    anzahl += eintraege.length;
  }
  console.log(`${anzahl} Einträge geschrieben (${ohneSatz} ohne Beispielsatz), ${offen.length} offen.`);
  for (const o of offen) console.log(`  ${o}`);
  if (offen.length) process.exitCode = 1;
}

if (require.main === module) {
  const [befehl, argument] = process.argv.slice(2);
  if (befehl === 'zeige' && argument) zeige(argument);
  else if (befehl === 'baue') baue(process.argv.slice(3));
  else if (befehl === 'dateien') for (const [name, teil] of dateien()) console.log(name, teil.length);
  else {
    console.log('Aufruf: node content-plan/chinesische-woerter.cjs dateien | zeige <stufe>-<nnnn> | baue');
    process.exitCode = 1;
  }
}

module.exports = { silbenProblem, zerlege, satzSilben, wortPinyin };
