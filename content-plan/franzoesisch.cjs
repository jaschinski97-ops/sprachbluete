#!/usr/bin/env node
/**
 * Französischer Wortschatz aus dem vorhandenen Bestand (04.11.2026).
 *
 * Jeder Begriff hat in den vier anderen Lernsprachen schon eine französische
 * Bedeutung (`translations.fr`) und meist Beispielsätze, deren französische
 * Fassung samt aller zehn Übersetzungen vorliegt (`exampleTranslations`).
 * Daraus entsteht der Eintrag; von Hand (Claude) kommen nur Wortwahl,
 * Lautschrift, Genus und Plural dazu.
 *
 *   node content-plan/franzoesisch.cjs zeige <stufe>-<nnnn>
 *     zeigt die 50 Begriffe der Datei kompakt: Rang, Begriff, Wortart,
 *     Englisch, Deutsch, französische Bedeutungen aus dem Bestand und die
 *     Sätze, falls keiner das vorgeschlagene Wort enthält.
 *
 *   node content-plan/franzoesisch.cjs baue
 *     liest _Local/woerter/fr/tsv/<stufe>-<nnnn>.tsv und schreibt
 *     _Local/woerter/fr/<stufe>-<nnnn>.json im Format der anderen Sprachen.
 *     Danach: node content-plan/pruefe-woerter.cjs _Local/woerter/fr
 *
 * TSV-Zeile (Felder mit „|“ getrennt, „#“ am Anfang = Kommentar):
 *   begriff  ohne „c:“ (z. B. „to_eat“)
 *   wort     „-“ lässt den Begriff für Französisch aus (gleiches Wort steht
 *            schon unter einem anderen Begriff, wie die Lücken im Spanischen)
 *   ipa      Lautschrift mit Silbenpunkten, ohne Schrägstriche („mɛ.zɔ̃“)
 *   genus    nur Nomen: m oder f; „m!“/„f!“ bei h aspiré (kein „l’“);
 *            „pl“ = nur Mehrzahl („les gens“): Artikel steht im Wort, kein Genus;
 *            „-:<wortart>“ = feste Wendung ohne Genus mit eigener Wortart
 *            („à la maison“ → „-:adverb“, „sauver la face“ → „-:verb“);
 *            ein Nomen ohne Genus lehnt die Wortprüfung sonst ab
 *   plural   leer = Regel (+s; -s/-x/-z bleibt; -al → -aux; -eau/-au/-eu → +x),
 *            „—“ = kein Plural, sonst die Form
 *   satz     leer = erster Satz mit dem Wort, „0“ = kein Beispiel,
 *            „#2“ = Satz Nummer 2 aus `zeige`
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ZIEL = path.join(ROOT, '_Local/woerter/fr');
const TSV = path.join(ZIEL, 'tsv');
const STUFEN = ['beginner', 'experienced', 'pro'];
const JE_DATEI = 50;
// generatedAt = Begriffsrang wie bei den anderen Sprachen (24.10.2026, 15:00 UTC + Rang in Sekunden).
const RANG_BASIS = 1792854000000;
const UI = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt'];
// Bedeutungen und Sätze zuerst aus Englisch (gleiche Brücke wie die meisten Lernenden).
const QUELLEN = ['en', 'es', 'de', 'th'];
const VERMERK = 'KI-Erzeugung (Claude) aus den Bedeutungen und Beispielsätzen der anderen Lernsprachen; Wortwahl, Lautschrift, Genus und Plural von Claude.';

function begriffe() {
  const alle = JSON.parse(fs.readFileSync(path.join(__dirname, 'begriffe.json'), 'utf8')).begriffe;
  return alle.map((b, rang) => ({ ...b, rang })).filter((b) => !b.onlyLanguages || b.onlyLanguages.includes('fr'));
}

/** Dateiname → Begriffe, in derselben Teilung wie die anderen Sprachen (je Stufe 50). */
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

const ARTIKEL = /^(le|la|les|un|une)\s+|^l['’]\s*/i;

/** „la maison (f)“ → „maison“. */
function grundform(text) {
  return String(text ?? '').normalize('NFC').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(ARTIKEL, '').trim();
}

function klein(text) {
  return String(text ?? '').toLowerCase().normalize('NFC').replace(/[’‘]/g, "'");
}

/**
 * Grober Abgleich: gebeugte Formen („réveille“, „maisons“, „belle“) zählen mit.
 * Kurze Wörter („il“, „ou“) nur als ganzes Wort; das Reflexivpronomen zählt nicht
 * („se réveiller“ passt auf „Réveille-toi“).
 */
function enthaelt(satz, wort) {
  const s = klein(satz);
  const teile = klein(wort).replace(/^s'/, '').split(/\s+/).filter((t) => t && t !== 'se' && t !== 'les');
  return teile.length > 0 && teile.every((teil) => {
    if (teil.length <= 3) return new RegExp(`(^|[^\\p{L}])${teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(s);
    return s.includes(teil.slice(0, teil.length - (teil.length >= 6 ? 2 : 1)));
  });
}

function saetze(docs) {
  const gesehen = new Set();
  const liste = [];
  for (const d of docs) {
    const fr = d.exampleTranslations?.fr;
    if (!fr || gesehen.has(fr)) continue;
    // Nur vollständige Übersetzungen taugen als Beispiel (Pflicht im neuen Wortformat).
    if (!UI.every((ui) => typeof d.exampleTranslations[ui] === 'string' && d.exampleTranslations[ui].trim())) continue;
    gesehen.add(fr);
    liste.push(d.exampleTranslations);
  }
  return liste;
}

function zeige(name) {
  const teil = dateien().get(name);
  if (!teil) throw Error(`Unbekannte Datei ${name}; es gibt ${[...dateien().keys()].join(' ')}`);
  const je = woerterJeBegriff();
  for (const b of teil) {
    const docs = je.get(b.id) ?? [];
    const stimmen = new Map();
    for (const d of docs) {
      const f = grundform(d.translations?.fr);
      if (f) stimmen.set(f, (stimmen.get(f) ?? 0) + 1);
    }
    const kandidaten = [...stimmen.entries()].sort((x, y) => y[1] - x[1]).map(([w]) => w);
    const de = docs.find((d) => d.language === 'de');
    const deWort = de ? (de.germanNoun ? `${de.germanNoun.article} ${de.term}` : de.term) : docs[0]?.german;
    const liste = saetze(docs);
    const treffer = liste.findIndex((s) => kandidaten[0] && enthaelt(s.fr, kandidaten[0]));
    const satzInfo = !liste.length ? ' · KEIN SATZ' : treffer < 0 ? ` · Sätze: ${liste.map((s, n) => `#${n + 1} ${s.fr}`).join(' ')}` : treffer > 0 ? ` · #${treffer + 1}` : '';
    console.log(`${b.rang} ${b.id.slice(2)} ${b.partOfSpeech} „${b.en}“ = ${deWort} | ${kandidaten.join(' / ')}${satzInfo}`);
  }
}

function regelPlural(wort) {
  if (/[sxz]$/.test(wort)) return wort;
  if (/al$/.test(wort)) return wort.replace(/al$/, 'aux');
  if (/(eau|au|eu)$/.test(wort)) return `${wort}x`;
  return `${wort}s`;
}

/** Vor Vokal und stummem h wird der Artikel zu „l’“. */
function elidiert(wort, aspire) {
  return !aspire && /^[aeiouyàâäéèêëîïôöùûüœæh]/i.test(wort);
}

function bedeutungen(docs, wort) {
  const translations = {};
  for (const ui of UI) {
    const text = ui === 'fr' ? wort : docs.map((d) => d.translations?.[ui]).find((t) => typeof t === 'string' && t.trim());
    if (text) translations[ui] = text;
  }
  return translations;
}

function baue() {
  const je = woerterJeBegriff();
  const plan = dateien();
  const offen = [];
  let anzahl = 0;
  let ohneSatz = 0;
  fs.mkdirSync(ZIEL, { recursive: true });
  for (const datei of fs.readdirSync(TSV).filter((f) => f.endsWith('.tsv')).sort()) {
    const name = datei.replace(/\.tsv$/, '');
    const erwartet = plan.get(name);
    if (!erwartet) throw Error(`${datei}: kein Dateiname aus dem Plan`);
    const info = new Map(erwartet.map((b) => [b.id, b]));
    const eintraege = [];
    const gesehen = new Set();
    for (const zeile of fs.readFileSync(path.join(TSV, datei), 'utf8').split('\n')) {
      if (!zeile.trim() || zeile.startsWith('#')) continue;
      const [roh, wortRoh = '', ipaRoh = '', genusRoh = '', pluralRoh = '', satzRoh = ''] = zeile.split('|').map((z) => z.trim());
      const begriff = `c:${roh}`;
      const b = info.get(begriff);
      if (!b) { offen.push(`${datei}: ${roh} gehört nicht in diese Datei`); continue; }
      gesehen.add(begriff);
      const wort = wortRoh.normalize('NFC').replace(/'/g, '’');
      if (wort === '-') continue;
      if (!wort || !ipaRoh) { offen.push(`${datei}: ${roh} ohne Wort oder Lautschrift`); continue; }
      const docs = je.get(begriff) ?? [];
      const en = docs.find((d) => d.language === 'en');
      const silben = ipaRoh.normalize('NFC').replace(/^\/|\/$/g, '').split('.').map((s) => s.trim()).filter(Boolean);
      const lautschrift = `/${silben.join('.')}/`;
      const doc = {
        id: `ki-fr-${roh.replace(/_/g, '-')}`,
        language: 'fr',
        concept: begriff,
        learningStage: b.stage,
        generatedAt: RANG_BASIS + b.rang * 1000,
        term: wort,
        romanization: lautschrift,
        ipa: lautschrift,
        syllables: silben.map((s) => ({ roman: `/${s}/` })),
        german: en?.german ?? docs.find((d) => d.german)?.german ?? wort,
        translations: bedeutungen(docs, wort),
        partOfSpeech: b.partOfSpeech,
        register: en?.register ?? docs[0]?.register ?? 'neutral',
        isConcrete: b.isConcrete,
        sourceVerified: false,
        verificationNote: VERMERK,
      };
      const wendung = /^-:([a-z]+)$/.exec(genusRoh);
      if (wendung) doc.partOfSpeech = wendung[1];
      else if (genusRoh.startsWith('-')) { offen.push(`${datei}: ${roh} Wendung ohne Wortart („-:adverb“)`); continue; }
      if (doc.partOfSpeech === 'noun' && genusRoh !== 'pl') {
        const aspire = genusRoh.endsWith('!');
        const gender = genusRoh.replace('!', '');
        if (gender !== 'm' && gender !== 'f') { offen.push(`${datei}: ${roh} ohne Genus`); continue; }
        const article = elidiert(wort, aspire) ? 'l’' : gender === 'm' ? 'le' : 'la';
        const plural = pluralRoh || regelPlural(wort);
        doc.frenchNoun = { gender, article, plural };
      }
      const liste = saetze(docs);
      let satz = null;
      if (satzRoh === '0') satz = null;
      else if (/^#\d+$/.test(satzRoh)) satz = liste[Number(satzRoh.slice(1)) - 1] ?? null;
      else if (!satzRoh) satz = liste.find((s) => enthaelt(s.fr, wort)) ?? null;
      else { offen.push(`${datei}: ${roh} Satzangabe „${satzRoh}“ unbekannt`); continue; }
      if (satzRoh && satzRoh !== '0' && !satz) offen.push(`${datei}: ${roh} Satz ${satzRoh} fehlt`);
      if (satz) {
        const texte = Object.fromEntries(UI.map((ui) => [ui, satz[ui]]));
        // Französische Typografie wie in den Wörtern („l’eau“); Schreiben und Diktat werten beide Apostrophe gleich.
        texte.fr = texte.fr.replace(/'/g, '’');
        doc.exampleTerm = texte.fr;
        // Wie bei Englisch: Die Satz-Umschrift blendet die App bei lateinischer Schrift aus.
        doc.exampleRoman = texte.fr;
        doc.exampleGerman = texte.de;
        doc.exampleTranslations = texte;
      } else {
        ohneSatz += 1;
        if (satzRoh !== '0' && liste.length) offen.push(`${datei}: ${roh} „${wort}“ ohne Satz — ${liste.map((x, n) => `#${n + 1} ${x.fr}`).join(' ')}`);
      }
      eintraege.push(doc);
    }
    for (const b of erwartet) if (!gesehen.has(b.id)) offen.push(`${datei}: ${b.id.slice(2)} fehlt`);
    fs.writeFileSync(path.join(ZIEL, `${name}.json`), `${JSON.stringify(eintraege, null, 1)}\n`);
    anzahl += eintraege.length;
  }
  console.log(`${anzahl} Einträge geschrieben (${ohneSatz} ohne Beispielsatz), ${offen.length} offen.`);
  for (const o of offen) console.log(`  ${o}`);
  if (offen.length) process.exitCode = 1;
}

const [befehl, argument] = process.argv.slice(2);
if (befehl === 'zeige' && argument) zeige(argument);
else if (befehl === 'baue') baue();
else if (befehl === 'dateien') for (const [name, teil] of dateien()) console.log(name, teil.length);
else {
  console.log('Aufruf: node content-plan/franzoesisch.cjs dateien | zeige <stufe>-<nnnn> | baue');
  process.exit(1);
}
