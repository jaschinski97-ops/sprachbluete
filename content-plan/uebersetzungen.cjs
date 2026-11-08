#!/usr/bin/env node
/**
 * Neue App-Sprachen nachziehen (07.11.2026): Bedeutungen, Beispielsätze und
 * Dialoge des ganzen Katalogs in weitere App-Sprachen übersetzen (zuerst
 * Japanisch und Italienisch). Claude schreibt die Übersetzungen in
 * Arbeitsdateien, dieses Werkzeug übernimmt sie in den Katalog.
 *
 *   node content-plan/uebersetzungen.cjs exportiere <ui> [<ui> …]
 *     schreibt _Local/uebersetzung/{bedeutungen,saetze,dialoge}/*.txt
 *   node content-plan/uebersetzungen.cjs pruefe <ui> [<ui> …]
 *     zeigt, was noch fehlt oder nicht passt
 *   node content-plan/uebersetzungen.cjs uebernimm <ui> [<ui> …]
 *     schreibt die Übersetzungen in src/content/catalog.json (Prüfsummen neu).
 *     Vorher den Studio-Helper beenden: Er hält den Katalog im Speicher und
 *     würde beim nächsten Liefern den alten Stand zurückschreiben.
 *
 * Arbeitsdatei: Blöcke, jeder beginnt mit „@<schlüssel> …“ (Rest der Zeile =
 * Hinweis), danach Zeilen „<code> <text>“. Offen sind die Zeilen der neuen
 * Sprachen („ja ?“); vorgefüllte Zeilen (Italienisch aus italienischen
 * Wörtern) dürfen korrigiert werden. Zeilen mit „#“ sind Kommentare.
 * Die Übersetzungen kommen in `<name>.antwort` daneben, eine Zeile je Block:
 * „b0001|犬|cane“ (siehe `leseAntworten`).
 *
 * Ein Wort oder Dialog in derselben Sprache wie die App-Sprache übersetzt sich
 * selbst (italienisches Wort → translations.it = das Wort); das setzt
 * `uebernimm` ohne Arbeitsdatei.
 */
const fs = require('node:fs');
const path = require('node:path');
const { digestOf, katalogText } = require('../scripts/content/pipeline.cjs');

const ROOT = path.resolve(__dirname, '..');
const KATALOG = path.join(ROOT, 'src/content/catalog.json');
const ARBEIT = path.join(ROOT, '_Local/uebersetzung');
const JE_DATEI = { bedeutungen: 500, saetze: 400, dialoge: 1 };
const SCHRIFT = {
  ja: /[぀-ヿ一-鿿]/u,
  it: /^[^Ѐ-ӿ֐-ۿऀ-৿฀-๿぀-ヿ一-鿿]*[A-Za-zÀ-ÿ]/u,
};

const ladeKatalog = () => JSON.parse(fs.readFileSync(KATALOG, 'utf8'));
const leer = (t) => typeof t !== 'string' || !t.trim();

/* ---------- Schlüssel: was einmal übersetzt wird ---------- */

function bedeutungsSchluessel(d) {
  return JSON.stringify([d.concept ?? d.id, d.translations?.en ?? '', d.translations?.de ?? '']);
}
function satzSchluessel(d) {
  return JSON.stringify([d.exampleTranslations?.en ?? '', d.exampleTranslations?.de ?? '']);
}

/** Alles, was übersetzt werden muss, mit Vorschlägen aus Wörtern der Zielsprache. */
function sammle(katalog, sprachen) {
  const bedeutungen = new Map();
  const saetze = new Map();
  const dialoge = [];
  for (const e of katalog.entries) {
    const d = e.document;
    if (e.kind === 'vocabulary') {
      const b = bedeutungen.get(bedeutungsSchluessel(d)) ?? { d, woerter: new Map(), vorschlag: {} };
      b.woerter.set(d.language, d.term);
      for (const ui of sprachen) if (d.language === ui) b.vorschlag[ui] = d.term;
      bedeutungen.set(bedeutungsSchluessel(d), b);
      if (d.exampleTranslations) {
        const s = saetze.get(satzSchluessel(d)) ?? { d, woerter: [], vorschlag: {} };
        s.woerter.push(`${d.language} ${d.term}`);
        for (const ui of sprachen) if (d.language === ui && d.exampleTerm) s.vorschlag[ui] = d.exampleTerm;
        saetze.set(satzSchluessel(d), s);
      }
    }
    if (e.kind === 'situations') dialoge.push(e);
  }
  return { bedeutungen, saetze, dialoge };
}

/* ---------- Export ---------- */

function block(id, hinweis, texte, sprachen, vorschlag = {}) {
  const zeilen = [`@${id}${hinweis ? ` ${hinweis}` : ''}`];
  for (const [code, text] of Object.entries(texte)) zeilen.push(`${code} ${text}`);
  for (const ui of sprachen) zeilen.push(`${ui} ${vorschlag[ui] ?? '?'}`);
  return zeilen.join('\n');
}

function exportiere(sprachen) {
  const katalog = ladeKatalog();
  const { bedeutungen, saetze, dialoge } = sammle(katalog, sprachen);
  const schreibe = (art, bloecke, kopf) => {
    const ordner = path.join(ARBEIT, art);
    fs.mkdirSync(ordner, { recursive: true });
    const index = {};
    let n = 0;
    for (let i = 0; i < bloecke.length; i += JE_DATEI[art]) {
      const teil = bloecke.slice(i, i + JE_DATEI[art]);
      const name = art === 'dialoge' ? teil[0].name : String(i / JE_DATEI[art] + 1).padStart(3, '0');
      const datei = path.join(ordner, `${name}.txt`);
      if (fs.existsSync(datei)) { n += 1; continue; } // schon in Arbeit: nie überschreiben
      fs.writeFileSync(datei, `${kopf}\n\n${teil.map((b) => b.text).join('\n\n')}\n`);
      for (const b of teil) index[b.id] = name;
      n += 1;
    }
    return n;
  };
  const kopf = (was) => `# ${was} — fülle die Zeilen ${sprachen.join(', ')} („?“). Vorgefüllte Zeilen prüfen.`;

  const bBloecke = [...bedeutungen.values()].map(({ d, woerter, vorschlag }, i) => {
    const id = `b${String(i + 1).padStart(4, '0')}`;
    const beispiele = [...woerter].filter(([l]) => !sprachen.includes(l)).slice(0, 4).map(([l, w]) => `${l} ${w}`).join(', ');
    return { id, text: block(id, `${d.concept ?? ''} (${d.partOfSpeech ?? '?'}) — ${beispiele}`, { de: d.translations?.de ?? d.german, en: d.translations?.en ?? '' }, sprachen, vorschlag) };
  });
  const sBloecke = [...saetze.values()].map(({ d, woerter, vorschlag }, i) => {
    const id = `s${String(i + 1).padStart(4, '0')}`;
    return { id, text: block(id, `Beispielsatz zu: ${woerter.slice(0, 3).join(', ')}`, { de: d.exampleTranslations.de, en: d.exampleTranslations.en }, sprachen, vorschlag) };
  });
  const dBloecke = dialoge.map((e) => {
    const d = e.document;
    const t = d.translations;
    const teile = [`# Dialog ${e.id}: P = Gesprächspartner, L = Lernende(r). Die Thai-Zeile zeigt das Geschlecht (ครับ/ผม = Mann, ค่ะ/คะ/ฉัน = Frau).`];
    const lern = d.direction.split('_to_')[1];
    teile.push(block('titel', '', { de: t.de.title, en: t.en.title }, sprachen));
    teile.push(block('szene', '', { de: t.de.setting, en: t.en.setting }, sprachen));
    d.scriptTurns.forEach((zug, i) => {
      const selbst = Object.fromEntries(sprachen.filter((ui) => ui === lern).map((ui) => [ui, zug.targetText]));
      teile.push(block(`zug${i + 1}`, `${zug.speaker === 'partner' ? 'P' : 'L'} ${lern}: ${zug.targetText}`, { th: t.th.turns[i], de: t.de.turns[i], en: t.en.turns[i] }, sprachen, selbst));
    });
    d.corrections.forEach((_, i) => {
      teile.push(block(`hinweis${i + 1}`, 'Problem', { de: t.de.corrections[i].issue, en: t.en.corrections[i].issue }, sprachen));
      teile.push(block(`erklaerung${i + 1}`, '', { de: t.de.corrections[i].explanation, en: t.en.corrections[i].explanation }, sprachen));
    });
    return { id: e.id, name: e.id, text: teile.join('\n\n') };
  });
  const nb = schreibe('bedeutungen', bBloecke, kopf('Wortbedeutungen (kurz, wie im Wörterbuch; Verben im Infinitiv bzw. Japanisch in Wörterbuchform)'));
  const ns = schreibe('saetze', sBloecke, kopf('Beispielsätze (natürlich; Japanisch in です/ます-Form)'));
  const nd = schreibe('dialoge', dBloecke, kopf('Dialog'));
  // Schlüssel → Block-ID für die Übernahme.
  fs.writeFileSync(path.join(ARBEIT, 'index.json'), JSON.stringify({
    sprachen,
    bedeutungen: Object.fromEntries([...bedeutungen.keys()].map((k, i) => [k, `b${String(i + 1).padStart(4, '0')}`])),
    saetze: Object.fromEntries([...saetze.keys()].map((k, i) => [k, `s${String(i + 1).padStart(4, '0')}`])),
  }));
  console.log(`${bBloecke.length} Bedeutungen in ${nb} Dateien, ${sBloecke.length} Sätze in ${ns} Dateien, ${dBloecke.length} Dialoge.`);
}

/* ---------- Lesen und Prüfen ---------- */

/**
 * Antworten stehen zeilenweise in `<name>.antwort` neben der Arbeitsdatei:
 * „<id>|<text sprache 1>|<text sprache 2>“ in der Reihenfolge des Exports
 * (index.json, z. B. ja|it). Spätere Zeilen ersetzen frühere. So geht bei
 * einer Unterbrechung nichts verloren.
 */
function leseAntworten(datei, bloecke) {
  const antwort = datei.replace(/\.txt$/, '.antwort');
  if (!fs.existsSync(antwort)) return;
  const { sprachen } = JSON.parse(fs.readFileSync(path.join(ARBEIT, 'index.json'), 'utf8'));
  fs.readFileSync(antwort, 'utf8').split('\n').forEach((roh, i) => {
    const zeile = roh.trim();
    if (!zeile || zeile.startsWith('#')) return;
    const felder = zeile.split('|').map((f) => f.trim());
    const wo = `${path.basename(antwort)} Zeile ${i + 1}`;
    if (felder.length !== sprachen.length + 1) throw Error(`${wo}: ${sprachen.length + 1} Felder erwartet („id|${sprachen.join('|')}“)`);
    const block = bloecke.get(felder[0]);
    if (!block) throw Error(`${wo}: unbekannter Block ${felder[0]}`);
    sprachen.forEach((ui, k) => { block[ui] = felder[k + 1]; });
  });
}

/** Liest eine Arbeitsdatei samt Antworten: Block-ID → { code: text }. */
function leseDatei(datei) {
  const bloecke = new Map();
  let aktuell = null;
  for (const roh of fs.readFileSync(datei, 'utf8').split('\n')) {
    const zeile = roh.trimEnd();
    if (!zeile || zeile.startsWith('#')) continue;
    if (zeile.startsWith('@')) {
      aktuell = {};
      bloecke.set(zeile.slice(1).split(' ')[0], aktuell);
      continue;
    }
    const m = /^([a-z]{2}) (.*)$/.exec(zeile);
    if (!m || !aktuell) throw Error(`${path.basename(datei)}: unbekannte Zeile „${zeile.slice(0, 40)}“`);
    aktuell[m[1]] = m[2].trim();
  }
  leseAntworten(datei, bloecke);
  return bloecke;
}

function problem(text, ui) {
  if (leer(text) || text === '?') return 'fehlt';
  // Zitierte Beispiele der Lernsprache («个», „ครับ“, (zhè ge)) zählen nicht zur Schrift.
  const ohneZitat = text.replace(/«[^»]*»|“[^”]*”|„[^“”]*[“”]|"[^"]*"|‚[^‘’]*[‘’]|\([^)]*\)|（[^）]*）/g, ' ');
  const pruefText = ui === 'it' && /[A-Za-zÀ-ÿ]/.test(ohneZitat) ? ohneZitat : text;
  if (SCHRIFT[ui] && !SCHRIFT[ui].test(pruefText)) return `passt nicht zur Schrift: ${text.slice(0, 40)}`;
  return null;
}

function leseAlle(art, sprachen) {
  const ordner = path.join(ARBEIT, art);
  const alle = new Map();
  const probleme = [];
  if (!fs.existsSync(ordner)) return { alle, probleme: [`${art}: keine Arbeitsdateien`] };
  for (const name of fs.readdirSync(ordner).filter((f) => f.endsWith('.txt')).sort()) {
    const bloecke = leseDatei(path.join(ordner, name));
    for (const [id, texte] of bloecke) {
      for (const ui of sprachen) {
        const p = problem(texte[ui], ui);
        if (p) probleme.push(`${art}/${name} @${id} ${ui}: ${p}`);
      }
    }
    alle.set(name.replace(/\.txt$/, ''), bloecke);
  }
  return { alle, probleme };
}

function pruefe(sprachen) {
  let summe = 0;
  for (const art of ['bedeutungen', 'saetze', 'dialoge']) {
    const { alle, probleme } = leseAlle(art, sprachen);
    const bloecke = [...alle.values()].reduce((n, b) => n + b.size, 0);
    console.log(`${art}: ${alle.size} Dateien, ${bloecke} Blöcke, ${probleme.length} offen`);
    for (const p of probleme.slice(0, 15)) console.log(`  ${p}`);
    if (probleme.length > 15) console.log(`  … und ${probleme.length - 15} weitere`);
    summe += probleme.length;
  }
  if (summe) process.exitCode = 1;
}

/* ---------- Übernahme ---------- */

function uebernimm(sprachen) {
  const index = JSON.parse(fs.readFileSync(path.join(ARBEIT, 'index.json'), 'utf8'));
  const teile = {};
  for (const art of ['bedeutungen', 'saetze', 'dialoge']) {
    const { alle, probleme } = leseAlle(art, sprachen);
    if (probleme.length) throw Error(`${art}: ${probleme.length} offen, zuerst „pruefe“ (${probleme[0]})`);
    teile[art] = alle;
  }
  const flach = (alle) => new Map([...alle.values()].flatMap((b) => [...b.entries()]));
  const bedeutungen = flach(teile.bedeutungen);
  const saetze = flach(teile.saetze);
  const katalog = ladeKatalog();
  let geaendert = 0;
  const fehlt = [];
  for (const e of katalog.entries) {
    const d = e.document;
    const vorher = JSON.stringify(d);
    if (e.kind === 'vocabulary') {
      const b = bedeutungen.get(index.bedeutungen[bedeutungsSchluessel(d)]);
      for (const ui of sprachen) {
        if (d.language === ui) d.translations = { ...d.translations, [ui]: d.term };
        else if (b?.[ui]) d.translations = { ...d.translations, [ui]: b[ui] };
        else fehlt.push(`${d.id} Bedeutung ${ui}`);
      }
      if (d.exampleTranslations) {
        const s = saetze.get(index.saetze[satzSchluessel(d)]);
        for (const ui of sprachen) {
          if (d.language === ui && d.exampleTerm) d.exampleTranslations = { ...d.exampleTranslations, [ui]: d.exampleTerm };
          else if (s?.[ui]) d.exampleTranslations = { ...d.exampleTranslations, [ui]: s[ui] };
          else fehlt.push(`${d.id} Satz ${ui}`);
        }
      }
    }
    if (e.kind === 'situations') {
      const b = teile.dialoge.get(e.id);
      if (!b) { fehlt.push(`${e.id} Dialog`); continue; }
      for (const ui of sprachen) {
        d.translations[ui] = {
          title: b.get('titel')[ui],
          setting: b.get('szene')[ui],
          turns: d.scriptTurns.map((_, i) => b.get(`zug${i + 1}`)[ui]),
          corrections: d.corrections.map((_, i) => ({ issue: b.get(`hinweis${i + 1}`)[ui], explanation: b.get(`erklaerung${i + 1}`)[ui] })),
        };
      }
    }
    if (JSON.stringify(d) !== vorher) {
      e.digest = digestOf(e.kind, d);
      geaendert += 1;
    }
  }
  if (fehlt.length) throw Error(`${fehlt.length} Lücken, nichts geschrieben: ${fehlt.slice(0, 5).join('; ')}`);
  fs.writeFileSync(KATALOG, katalogText(katalog));
  console.log(`${geaendert} Einträge um ${sprachen.join(', ')} ergänzt.`);
}

if (require.main === module) {
  const [befehl, ...sprachen] = process.argv.slice(2);
  if (!sprachen.length) befehl === undefined;
  if (befehl === 'exportiere' && sprachen.length) exportiere(sprachen);
  else if (befehl === 'pruefe' && sprachen.length) pruefe(sprachen);
  else if (befehl === 'pruefe-datei' && sprachen.length >= 2) {
    // Eine Arbeitsdatei: node content-plan/uebersetzungen.cjs pruefe-datei <datei> ja it
    const [datei, ...uis] = sprachen;
    const offen = [];
    for (const [id, texte] of leseDatei(datei)) for (const ui of uis) {
      const p = problem(texte[ui], ui);
      if (p) offen.push(`@${id} ${ui}: ${p}`);
    }
    console.log(`${path.basename(datei)}: ${offen.length} offen`);
    for (const o of offen.slice(0, 30)) console.log(`  ${o}`);
    if (offen.length) process.exitCode = 1;
  }
  else if (befehl === 'uebernimm' && sprachen.length) uebernimm(sprachen);
  else {
    console.log('Aufruf: node content-plan/uebersetzungen.cjs exportiere|pruefe|uebernimm <ui> [<ui> …]');
    process.exitCode = 1;
  }
}

module.exports = { leseDatei, bedeutungsSchluessel, satzSchluessel };
