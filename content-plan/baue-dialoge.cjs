#!/usr/bin/env node
/**
 * Baut Dialog-Dateien aus einer kompakten Textquelle (04.11.2026, für die
 * französischen Dialoge). Das Ziel ist dasselbe JSON wie bei den anderen
 * Sprachen (`_Local/dialoge/<sprache>/<id>.json`), geprüft und geliefert mit
 * `content-plan/dialoge.cjs`.
 *
 *   node content-plan/baue-dialoge.cjs zeige <sprache> <id>    Zielwörter des Plans
 *   node content-plan/baue-dialoge.cjs baue <sprache> [<id> …]  Quelle → JSON
 *
 * Quelle `_Local/dialoge/<sprache>/quelle/<id>.txt`, eine Angabe je Zeile:
 *   = <app-sprache> Titel || Beschreibung     (für alle 10 App-Sprachen)
 *   P <aussprache>                             neuer Zug der Gesprächspartnerin
 *   L <aussprache>                             neuer Zug der lernenden Person
 *   <app-sprache> Text                         der Zug in dieser Sprache
 *   !                                          neuer Korrektur-Hinweis
 *   <app-sprache> Problem || Erklärung         der Hinweis in dieser Sprache
 * Die Zeile der Lernsprache ist der Dialogtext. Leere Zeilen und „#“ zählen nicht.
 * Japanisch (07.11.2026): Nach P/L steht die Kana-Lesung mit Leerzeichen
 * zwischen den Wörtern („きょう は いい てんき です ね。“); das Romaji rechnet
 * `japanisch-lesung.cjs` daraus, die Lesung bleibt als `kana` am Zug.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { satzRomaji } = require('./japanisch-lesung.cjs');
const UI = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt', 'it', 'ja'];

const ordner = (sprache) => path.join(ROOT, '_Local/dialoge', sprache);
const plan = (sprache) => JSON.parse(fs.readFileSync(path.join(ordner(sprache), 'plan.json'), 'utf8'));

function zeige(sprache, id) {
  const spec = plan(sprache).find((s) => s.id === id);
  if (!spec) throw Error(`${id} steht nicht im Plan`);
  const wort = (w) => `${w.term} (${w.german})`;
  console.log(`${spec.id} · ${spec.level} · ${spec.topic} · ${spec.stage}`);
  console.log(`Ziel: ${spec.targetWords.map(wort).join(' · ')}`);
  if (spec.reviewWords.length) console.log(`Wiederholen: ${spec.reviewWords.map(wort).join(' · ')}`);
}

/** Quelle lesen; wirft mit Zeilennummer bei jeder Lücke. */
function lies(sprache, text) {
  // Lernsprachen ohne App-Oberfläche (it) brauchen eine eigene Zeile je Zug.
  const ZUG = UI.includes(sprache) ? UI : [...UI, sprache];
  const titel = {};
  const zuege = [];
  const hinweise = [];
  let aktuell = null;
  text.split('\n').forEach((roh, index) => {
    const zeile = roh.trim();
    const wo = `Zeile ${index + 1}`;
    if (!zeile || zeile.startsWith('#')) return;
    if (zeile.startsWith('= ')) {
      const [code, ...rest] = zeile.slice(2).split(' ');
      const [title, setting] = rest.join(' ').split('||').map((t) => t.trim());
      if (!UI.includes(code) || !title || !setting) throw Error(`${wo}: Titel braucht „= <sprache> Titel || Beschreibung“`);
      titel[code] = { title, setting };
      return;
    }
    if (/^[PL] /.test(zeile)) {
      aktuell = { art: 'zug', speaker: zeile[0] === 'P' ? 'partner' : 'learner', roman: zeile.slice(2).trim(), texte: {} };
      zuege.push(aktuell);
      return;
    }
    if (zeile === '!') {
      aktuell = { art: 'hinweis', texte: {} };
      hinweise.push(aktuell);
      return;
    }
    const code = zeile.slice(0, 2);
    const inhalt = zeile.slice(3).trim();
    if (!ZUG.includes(code) || zeile[2] !== ' ' || !inhalt) throw Error(`${wo}: unbekannte Zeile „${zeile.slice(0, 30)}“`);
    if (!aktuell) throw Error(`${wo}: Text vor dem ersten Zug`);
    if (aktuell.texte[code]) throw Error(`${wo}: ${code} doppelt`);
    if (aktuell.art === 'hinweis' && !UI.includes(code)) throw Error(`${wo}: Hinweise nur in App-Sprachen`);
    if (aktuell.art === 'hinweis') {
      const [issue, explanation] = inhalt.split('||').map((t) => t.trim());
      if (!issue || !explanation) throw Error(`${wo}: Hinweis braucht „Problem || Erklärung“`);
      aktuell.texte[code] = { issue, explanation };
    } else {
      aktuell.texte[code] = inhalt;
    }
  });
  const fehlt = (texte, codes = UI) => codes.filter((code) => !texte[code]);
  if (fehlt(titel).length) throw Error(`Titel fehlt für ${fehlt(titel).join(', ')}`);
  zuege.forEach((zug, i) => { if (fehlt(zug.texte, ZUG).length) throw Error(`Zug ${i + 1}: fehlt ${fehlt(zug.texte, ZUG).join(', ')}`); });
  hinweise.forEach((h, i) => { if (fehlt(h.texte).length) throw Error(`Hinweis ${i + 1}: fehlt ${fehlt(h.texte).join(', ')}`); });
  if (!zuege.length || !hinweise.length) throw Error('Dialog braucht Züge und mindestens einen Hinweis');
  return {
    title: titel.de.title,
    setting: titel.de.setting,
    scriptTurns: zuege.map((zug) => ({
      speaker: zug.speaker,
      targetText: zug.texte[sprache],
      thai: zug.texte.th,
      roman: sprache === 'ja' ? satzRomaji(zug.roman) : zug.roman,
      ...(sprache === 'ja' ? { kana: zug.roman } : {}),
      german: zug.texte.de,
    })),
    corrections: hinweise.map((h) => h.texte.de),
    translations: Object.fromEntries(UI.map((code) => [code, {
      title: titel[code].title,
      setting: titel[code].setting,
      turns: zuege.map((zug) => zug.texte[code]),
      corrections: hinweise.map((h) => h.texte[code]),
    }])),
  };
}

function baue(sprache, ids) {
  const quelle = path.join(ordner(sprache), 'quelle');
  const dateien = fs.readdirSync(quelle).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
  const auswahl = ids.length ? ids : dateien;
  const bekannt = new Set(plan(sprache).map((s) => s.id));
  let fehler = 0;
  for (const id of auswahl) {
    try {
      if (!bekannt.has(id)) throw Error('steht nicht im Plan');
      const dialog = lies(sprache, fs.readFileSync(path.join(quelle, `${id}.txt`), 'utf8'));
      fs.writeFileSync(path.join(ordner(sprache), `${id}.json`), JSON.stringify(dialog, null, 1) + '\n');
    } catch (error) {
      fehler += 1;
      console.log(`FEHLER ${id}: ${error.message}`);
    }
  }
  console.log(`${auswahl.length - fehler} von ${auswahl.length} gebaut.`);
  process.exitCode = fehler ? 1 : 0;
}

const [befehl, sprache, ...rest] = process.argv.slice(2);
if (befehl === 'zeige' && sprache) for (const id of rest) zeige(sprache, id);
else if (befehl === 'baue' && sprache) baue(sprache, rest);
else {
  console.log('Aufruf: baue-dialoge.cjs zeige <sprache> <id …> | baue <sprache> [<id …>]');
  process.exitCode = 2;
}

module.exports = { lies };
