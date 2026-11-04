#!/usr/bin/env node
/**
 * Prüft selbst geschriebene Wortschatz-Dateien, bevor sie in den Katalog
 * gehen (24.10.2026). Dieselben Regeln wie Studio und Helper
 * (`isValidVocabEntry`, `pruefeVocabDoc`) plus der Abgleich mit der
 * gemeinsamen Begriffsliste `begriffe.json`.
 *
 * Aufruf: node content-plan/pruefe-woerter.cjs <datei.json|ordner> [...]
 * Eine Datei enthält ein JSON-Array von Wortschatz-Einträgen (VocabEntry).
 * Ausgabe: je Fehler eine Zeile; Exit-Code 1, wenn etwas nicht stimmt.
 */
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../scripts/content/domain.cjs');

const { isValidVocabEntry, pruefeVocabDoc, vocabSchluessel } = domain.load('src/lib/content/vocab-schema');
const { UI_LANGUAGES } = domain.load('src/lib/i18n/types');
const { isSharedConcept } = domain.load('src/lib/concepts');

const begriffe = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'begriffe.json'), 'utf8')).begriffe.map((b) => [b.id, b]));

function dateienAus(argumente) {
  return argumente.flatMap((arg) => fs.statSync(arg).isDirectory()
    ? fs.readdirSync(arg).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(arg, f))
    : [arg]);
}

/**
 * Spanische Nomen (04.11.2026): Ein Bauskript hatte mehrteilige Plurale am
 * Leerzeichen geteilt („medios ambientes“ → Plural „medios“, Artikel
 * „ambientes“). Artikel el/la passend zum Genus; „el“ auch vor betontem
 * a-/ha- (el agua, el aula). Ein mehrteiliges Wort hat einen ebenso langen
 * Plural, „—“ heißt ohne Plural.
 */
function spanischesNomenFehler({ term, spanishNoun: { gender, article, plural } }) {
  const fehler = [];
  if (!['m', 'f'].includes(gender)) fehler.push(`Genus „${gender}“ ist weder m noch f`);
  if (!['el', 'la'].includes(article)) fehler.push(`Artikel „${article}“ ist weder el noch la`);
  else if (gender === 'm' ? article !== 'el' : article !== 'la' && !/^h?[aá]/i.test(term)) fehler.push(`Artikel ${article} passt nicht zum Genus ${gender}`);
  if (typeof plural !== 'string' || !plural.trim()) fehler.push('Plural fehlt („—“ für keinen Plural)');
  else if (plural !== '—' && plural.trim().split(/\s+/).length < term.trim().split(/\s+/).length) fehler.push(`Plural „${plural}“ ist kürzer als das Wort`);
  return fehler;
}

const fehler = [];
const schluessel = new Map();
const begriffJeSprache = new Map();
let anzahl = 0;
for (const datei of dateienAus(process.argv.slice(2))) {
  const eintraege = JSON.parse(fs.readFileSync(datei, 'utf8'));
  if (!Array.isArray(eintraege)) { fehler.push(`${datei}: kein JSON-Array`); continue; }
  for (const w of eintraege) {
    anzahl += 1;
    const wo = `${path.basename(datei)} ${w?.id ?? '?'} (${w?.term ?? '?'})`;
    if (!isValidVocabEntry(w)) { fehler.push(`${wo}: verletzt das Schema (isValidVocabEntry)`); continue; }
    const pruefung = pruefeVocabDoc(w);
    for (const f of pruefung.fehler) fehler.push(`${wo}: ${f}`);
    if (!/^ki-(th|en|es|de)-[a-z0-9-]+$/.test(w.id) || !w.id.startsWith(`ki-${w.language}-`)) fehler.push(`${wo}: ID muss ki-${w.language}-… sein`);
    if (!String(w.verificationNote ?? '').startsWith('KI-')) fehler.push(`${wo}: verificationNote muss mit „KI-“ beginnen (sonst sehen Lernende ihn)`);
    const fehlend = UI_LANGUAGES.filter((l) => typeof w.translations?.[l] !== 'string' || !w.translations[l].trim());
    if (fehlend.length) fehler.push(`${wo}: Bedeutung fehlt für ${fehlend.join(', ')}`);
    if (!isSharedConcept(w.concept)) { fehler.push(`${wo}: concept ist keine gemeinsame Kennung`); continue; }
    const b = begriffe.get(w.concept);
    if (!b) fehler.push(`${wo}: Begriff ${w.concept} steht nicht in begriffe.json`);
    else {
      if (b.stage !== (w.learningStage ?? 'beginner')) fehler.push(`${wo}: Stufe ${w.learningStage} passt nicht zum Begriff (${b.stage})`);
      if (b.onlyLanguages && !b.onlyLanguages.includes(w.language)) fehler.push(`${wo}: Begriff gilt nur für ${b.onlyLanguages.join(', ')}`);
    }
    if (w.language === 'es' && w.spanishNoun) for (const f of spanischesNomenFehler(w)) fehler.push(`${wo}: ${f}`);
    const k = vocabSchluessel(w.term, w.language);
    if (schluessel.has(k)) fehler.push(`${wo}: Wort doppelt (auch ${schluessel.get(k)})`);
    else schluessel.set(k, w.id);
    const bk = `${w.language}:${w.concept}`;
    if (begriffJeSprache.has(bk)) fehler.push(`${wo}: Begriff ${w.concept} in ${w.language} doppelt (auch ${begriffJeSprache.get(bk)})`);
    else begriffJeSprache.set(bk, w.id);
  }
}
for (const f of fehler) console.log(f);
console.log(`${anzahl} Einträge geprüft, ${fehler.length} Fehler.`);
process.exit(fehler.length ? 1 : 0);
