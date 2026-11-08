#!/usr/bin/env node
/**
 * Portugiesischer und italienischer Wortschatz aus dem vorhandenen Bestand
 * (07.11.2026), nach dem Muster von `franzoesisch.cjs`.
 *
 * Jeder Begriff liegt in den anderen Lernsprachen schon mit Bedeutungen in
 * allen zehn App-Sprachen vor, meist mit Beispielsätzen samt Übersetzungen
 * (`exampleTranslations`). Daraus entsteht der Eintrag; von Hand (Claude)
 * kommen Wortwahl, Lautschrift, Genus und Plural dazu.
 *
 *   Portugiesisch ist App-Sprache: Bedeutung (`translations.pt`) und Satz
 *   (`exampleTranslations.pt`) stehen schon im Bestand.
 *   Italienisch ist KEINE App-Sprache: Den Satz übersetzt Claude aus einem
 *   vorhandenen Beispielsatz (Spalte „satz“: „#n Italienischer Satz“); die
 *   zehn Übersetzungen kommen aus diesem Quellsatz.
 *
 *   node content-plan/romanische-woerter.cjs <pt|it> dateien
 *   node content-plan/romanische-woerter.cjs <pt|it> zeige <stufe>-<nnnn>
 *   node content-plan/romanische-woerter.cjs <pt|it> baue
 *     liest _Local/woerter/<sprache>/tsv/*.tsv, schreibt _Local/woerter/<sprache>/*.json.
 *     Danach: node content-plan/pruefe-woerter.cjs _Local/woerter/<sprache>
 *
 * TSV-Zeile (Felder mit „|“, „#“ am Zeilenanfang = Kommentar):
 *   begriff  ohne „c:“
 *   wort     „-“ = Begriff auslassen (gleiches Wort steht schon unter einem anderen)
 *   ipa      Lautschrift mit Silbenpunkten, ohne Schrägstriche („ˈka.za“)
 *   genus    nur Nomen: m oder f; „m:lo“ usw. = Artikel ausdrücklich (it: Wörter
 *            mit h, w, y, Fremdwörter); „pl“ = nur Mehrzahl, Artikel im Wort
 *            („os óculos“, „gli occhiali“); „-:<wortart>“ = Wendung ohne Genus
 *   (pt auch „#n <eigener Satz>“: brasilianische Fassung des Quellsatzes)
 *   plural   leer = Regel (siehe `regelPlural`), „—“ = kein Plural, sonst die Form
 *   satz     pt: leer = erster Satz mit dem Wort, „0“ = keiner, „#n“ = Satz n
 *            it: „#n <italienischer Satz>“ (Übersetzung von Quellsatz n), „0“ = keiner
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STUFEN = ['beginner', 'experienced', 'pro'];
const JE_DATEI = 50;
// generatedAt = Begriffsrang wie bei den anderen Sprachen (24.10.2026, 15:00 UTC + Rang in Sekunden).
const RANG_BASIS = 1792854000000;
const UI = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt', 'it', 'ja'];
// Bedeutungen und Sätze zuerst aus Englisch, dann aus den romanischen Nachbarn.
const QUELLEN = ['en', 'es', 'fr', 'de', 'th'];

const SPRACHEN = {
  pt: {
    name: 'Portugiesisch',
    ui: true,
    vermerk: 'KI-Erzeugung (Claude) aus den Bedeutungen und Beispielsätzen der anderen Lernsprachen; Wortwahl, Lautschrift (Brasilien), Genus und Plural von Claude.',
    artikel: /^(o|a|os|as|um|uma)\s+/i,
  },
  it: {
    name: 'Italienisch',
    ui: false,
    vermerk: 'KI-Erzeugung (Claude): Bedeutungen aus den anderen Lernsprachen, Beispielsatz von Claude aus einem vorhandenen Satz übersetzt (dessen Übersetzungen gelten); Wortwahl, Lautschrift, Genus und Plural von Claude.',
    artikel: /^(il|lo|la|i|gli|le|un|uno|una)\s+|^l['’]\s*|^un['’]\s*/i,
  },
};

function begriffe(sprache) {
  const alle = JSON.parse(fs.readFileSync(path.join(__dirname, 'begriffe.json'), 'utf8')).begriffe;
  return alle.map((b, rang) => ({ ...b, rang })).filter((b) => !b.onlyLanguages || b.onlyLanguages.includes(sprache));
}

/** Dateiname → Begriffe, in derselben Teilung wie die anderen Sprachen (je Stufe 50). */
function dateien(sprache) {
  const liste = begriffe(sprache);
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

const klein = (text) => String(text ?? '').toLowerCase().normalize('NFC').replace(/[’‘]/g, "'");

function grundform(sprache, text) {
  return String(text ?? '').normalize('NFC').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(SPRACHEN[sprache].artikel, '').trim();
}

/** Grober Abgleich wie bei Französisch: gebeugte Formen zählen mit, kurze Wörter nur ganz. */
function enthaelt(satz, wort) {
  const s = klein(satz);
  const teile = klein(wort).replace(/-se$/, '').replace(/rsi$/, 're').split(/\s+/).filter(Boolean);
  return teile.length > 0 && teile.every((teil) => {
    if (teil.length <= 3) return new RegExp(`(^|[^\\p{L}])${teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(s);
    return s.includes(teil.slice(0, teil.length - (teil.length >= 6 ? 2 : 1)));
  });
}

/** Vollständig übersetzte Beispielsätze der anderen Lernsprachen (ohne Doppelte). */
function saetze(docs, schluessel) {
  const gesehen = new Set();
  const liste = [];
  for (const d of docs) {
    const t = d.exampleTranslations;
    if (!t || !UI.every((ui) => typeof t[ui] === 'string' && t[ui].trim())) continue;
    const key = t[schluessel];
    if (!key || gesehen.has(key)) continue;
    gesehen.add(key);
    liste.push(t);
  }
  return liste;
}

function zeige(sprache, name) {
  const teil = dateien(sprache).get(name);
  if (!teil) throw Error(`Unbekannte Datei ${name}`);
  const je = woerterJeBegriff();
  for (const b of teil) {
    const docs = je.get(b.id) ?? [];
    const de = docs.find((d) => d.language === 'de');
    const deWort = de ? (de.germanNoun ? `${de.germanNoun.article} ${de.term}` : de.term) : docs[0]?.german;
    if (sprache === 'pt') {
      const stimmen = new Map();
      for (const d of docs) {
        const f = grundform('pt', d.translations?.pt);
        if (f) stimmen.set(f, (stimmen.get(f) ?? 0) + 1);
      }
      const kandidaten = [...stimmen.entries()].sort((x, y) => y[1] - x[1]).map(([w]) => w);
      const liste = saetze(docs, 'pt');
      const treffer = liste.findIndex((s) => kandidaten[0] && enthaelt(s.pt, kandidaten[0]));
      const info = !liste.length ? ' · KEIN SATZ' : treffer < 0 ? ` · Sätze: ${liste.map((s, n) => `#${n + 1} ${s.pt}`).join(' ')}` : treffer > 0 ? ` · #${treffer + 1}` : '';
      console.log(`${b.id.slice(2)} ${b.partOfSpeech} „${b.en}“ = ${deWort} | ${kandidaten.join(' / ')}${info}`);
    } else {
      const es = docs.find((d) => d.language === 'es');
      const fr = docs.find((d) => d.language === 'fr');
      const liste = saetze(docs, 'en');
      // Der kürzeste Satz zuerst: weniger zu übersetzen, gleich viel Wort.
      const sortiert = liste.map((s, n) => ({ s, n })).sort((x, y) => x.s.en.length - y.s.en.length).slice(0, 2);
      const info = sortiert.length ? sortiert.map(({ s, n }) => `#${n + 1} ${s.en}`).join(' ') : 'KEIN SATZ';
      console.log(`${b.id.slice(2)} ${b.partOfSpeech} „${b.en}“ = ${deWort} | es ${es?.term ?? '-'} · fr ${fr?.term ?? '-'} | ${info}`);
    }
  }
}

/** Plural nach der Grundregel; Abweichungen stehen in der TSV. */
function regelPlural(sprache, wort, gender) {
  if (sprache === 'pt') {
    if (/ão$/.test(wort)) return wort.replace(/ão$/, 'ões');
    if (/m$/.test(wort)) return wort.replace(/m$/, 'ns');
    if (/[rz]$/.test(wort)) return `${wort}es`;
    if (/al$/.test(wort)) return wort.replace(/al$/, 'ais');
    if (/el$/.test(wort)) return wort.replace(/el$/, 'éis');
    if (/ol$/.test(wort)) return wort.replace(/ol$/, 'óis');
    if (/ul$/.test(wort)) return wort.replace(/ul$/, 'uis');
    if (/[sx]$/.test(wort)) return wort;
    return `${wort}s`;
  }
  // Italienisch: betonter Endvokal und Konsonant bleiben (città, caffè, bar).
  if (/[àèéìòù]$|[^aeiou]$/.test(wort)) return wort;
  if (/io$/.test(wort)) return wort.replace(/io$/, 'i');
  if (/[cg]a$/.test(wort) && gender === 'f') return wort.replace(/a$/, 'he');
  if (/o$/.test(wort)) return wort.replace(/o$/, 'i');
  if (/a$/.test(wort)) return gender === 'f' ? wort.replace(/a$/, 'e') : wort.replace(/a$/, 'i');
  if (/e$/.test(wort)) return wort.replace(/e$/, 'i');
  return wort;
}

/** Italienischer Artikel aus Genus und Anlaut; „m:lo“ in der TSV geht vor. */
function italienischerArtikel(wort, gender) {
  const w = klein(wort);
  const vokal = /^[aeiouàèéìòù]/.test(w) && !/^i[aeiouàèéìòù]/.test(w);
  if (vokal) return 'l’';
  if (gender === 'f') return 'la';
  return /^(?:s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiouàèéìòù])/.test(w) ? 'lo' : 'il';
}

function bedeutungen(sprache, docs, wort) {
  const translations = {};
  for (const ui of UI) {
    const text = ui === sprache ? wort : docs.map((d) => d.translations?.[ui]).find((t) => typeof t === 'string' && t.trim());
    if (text) translations[ui] = text;
  }
  return translations;
}

function baue(sprache) {
  const ziel = path.join(ROOT, '_Local/woerter', sprache);
  const tsv = path.join(ziel, 'tsv');
  const je = woerterJeBegriff();
  const plan = dateien(sprache);
  const offen = [];
  let anzahl = 0;
  let ohneSatz = 0;
  fs.mkdirSync(ziel, { recursive: true });
  for (const datei of fs.readdirSync(tsv).filter((f) => f.endsWith('.tsv')).sort()) {
    const name = datei.replace(/\.tsv$/, '');
    const erwartet = plan.get(name);
    if (!erwartet) throw Error(`${datei}: kein Dateiname aus dem Plan`);
    const info = new Map(erwartet.map((b) => [b.id, b]));
    const eintraege = [];
    const gesehen = new Set();
    for (const zeile of fs.readFileSync(path.join(tsv, datei), 'utf8').split('\n')) {
      if (!zeile.trim() || zeile.startsWith('#')) continue;
      const [roh, wortRoh = '', ipaRoh = '', genusRoh = '', pluralRoh = '', satzRoh = ''] = zeile.split('|').map((z) => z.trim());
      const begriff = `c:${roh}`;
      const b = info.get(begriff);
      if (!b) { offen.push(`${datei}: ${roh} gehört nicht in diese Datei`); continue; }
      if (gesehen.has(begriff)) { offen.push(`${datei}: ${roh} doppelt`); continue; }
      gesehen.add(begriff);
      const wort = wortRoh.normalize('NFC').replace(/'/g, '’');
      if (wort === '-') continue;
      if (!wort || !ipaRoh) { offen.push(`${datei}: ${roh} ohne Wort oder Lautschrift`); continue; }
      // Satzangabe in der Plural-Spalte (eine Spalte zu wenig) fällt sonst nicht auf.
      if (/^(#|0$)/.test(pluralRoh) || /^#/.test(genusRoh)) { offen.push(`${datei}: ${roh} Satzangabe in falscher Spalte`); continue; }
      const docs = je.get(begriff) ?? [];
      const en = docs.find((d) => d.language === 'en');
      const silben = ipaRoh.normalize('NFC').replace(/^\/|\/$/g, '').split('.').map((s) => s.trim()).filter(Boolean);
      const lautschrift = `/${silben.join('.')}/`;
      const doc = {
        id: `ki-${sprache}-${roh.replace(/_/g, '-')}`,
        language: sprache,
        concept: begriff,
        learningStage: b.stage,
        generatedAt: RANG_BASIS + b.rang * 1000,
        term: wort,
        romanization: lautschrift,
        ipa: lautschrift,
        syllables: silben.map((s) => ({ roman: `/${s}/` })),
        german: en?.german ?? docs.find((d) => d.german)?.german ?? wort,
        translations: bedeutungen(sprache, docs, wort),
        partOfSpeech: b.partOfSpeech,
        register: en?.register ?? docs[0]?.register ?? 'neutral',
        isConcrete: b.isConcrete,
        sourceVerified: false,
        verificationNote: SPRACHEN[sprache].vermerk,
      };
      const wendung = /^-:([a-z]+)$/.exec(genusRoh);
      if (wendung) doc.partOfSpeech = wendung[1];
      else if (genusRoh.startsWith('-')) { offen.push(`${datei}: ${roh} Wendung ohne Wortart („-:adverb“)`); continue; }
      if (doc.partOfSpeech === 'noun' && genusRoh !== 'pl') {
        const [gender, artikelRoh] = genusRoh.split(':');
        if (gender !== 'm' && gender !== 'f') { offen.push(`${datei}: ${roh} ohne Genus`); continue; }
        const plural = pluralRoh || regelPlural(sprache, wort, gender);
        if (sprache === 'pt') {
          doc.portugueseNoun = { gender, article: gender === 'm' ? 'o' : 'a', plural };
        } else {
          const article = (artikelRoh ? artikelRoh.replace(/'/g, '’') : italienischerArtikel(wort, gender));
          doc.italianNoun = { gender, article, plural };
        }
      } else if (genusRoh === 'pl' && doc.partOfSpeech !== 'noun') {
        offen.push(`${datei}: ${roh} „pl“ nur bei Nomen`);
      }
      const liste = saetze(docs, sprache === 'pt' ? 'pt' : 'en');
      let satz = null;
      let eigener = null;
      if (satzRoh === '0') satz = null;
      else if (sprache === 'it') {
        const m = /^#(\d+)\s+(.+)$/.exec(satzRoh);
        if (!m) { offen.push(`${datei}: ${roh} Satz braucht „#n Satz“ oder „0“`); continue; }
        satz = liste[Number(m[1]) - 1] ?? null;
        eigener = m[2].normalize('NFC').replace(/'/g, '’');
        if (!satz) offen.push(`${datei}: ${roh} Quellsatz ${m[1]} fehlt`);
      } else if (/^#\d+\s+\S/.test(satzRoh)) {
        // pt: eigene (brasilianische) Fassung des Quellsatzes — ersetzt auch
        // die pt-Übersetzung, die sonst europäisch sein kann („telemóvel“).
        const m = /^#(\d+)\s+(.+)$/.exec(satzRoh);
        satz = liste[Number(m[1]) - 1] ?? null;
        eigener = m[2].normalize('NFC');
      } else if (/^#\d+$/.test(satzRoh)) satz = liste[Number(satzRoh.slice(1)) - 1] ?? null;
      else if (!satzRoh) satz = liste.find((s) => enthaelt(s.pt, wort)) ?? null;
      else { offen.push(`${datei}: ${roh} Satzangabe „${satzRoh}“ unbekannt`); continue; }
      if (sprache === 'pt' && satzRoh && satzRoh !== '0' && !satz) offen.push(`${datei}: ${roh} Satz ${satzRoh} fehlt`);
      if (satz) {
        const texte = Object.fromEntries(UI.map((ui) => [ui, satz[ui]]));
        if (sprache === 'pt' && eigener) texte.pt = eigener;
        const zieltext = sprache === 'pt' ? texte.pt : eigener;
        doc.exampleTerm = zieltext;
        // Wie bei Französisch: Die Satz-Umschrift blendet die App bei lateinischer Schrift aus.
        doc.exampleRoman = zieltext;
        doc.exampleGerman = texte.de;
        doc.exampleTranslations = texte;
      } else {
        ohneSatz += 1;
        if (sprache === 'pt' && satzRoh !== '0' && liste.length) offen.push(`${datei}: ${roh} „${wort}“ ohne Satz — ${liste.map((x, n) => `#${n + 1} ${x.pt}`).join(' ')}`);
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

const [sprache, befehl, argument] = process.argv.slice(2);
if (!SPRACHEN[sprache]) {
  console.log('Aufruf: node content-plan/romanische-woerter.cjs <pt|it> dateien | zeige <stufe>-<nnnn> | baue');
  process.exit(1);
}
if (befehl === 'zeige' && argument) zeige(sprache, argument);
else if (befehl === 'baue') baue(sprache);
else if (befehl === 'dateien') for (const [name, teil] of dateien(sprache)) console.log(name, teil.length);
else {
  console.log('Aufruf: node content-plan/romanische-woerter.cjs <pt|it> dateien | zeige <stufe>-<nnnn> | baue');
  process.exit(1);
}
