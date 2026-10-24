#!/usr/bin/env node
/**
 * Baut aus den TSV-Dateien die gemeinsame Begriffsliste `begriffe.json`
 * (Reihenfolge = Häufigkeit/Nützlichkeit, Stufe aus dem Dateinamen) und
 * gleicht sie mit dem alten Katalog ab: Je Begriff und Lernsprache die alten
 * Wort-IDs, deren englische Bedeutung passt (Wiederverwertung, 24.10.2026).
 *
 * Aufruf: node content-plan/build-begriffe.cjs [pfad/zum/alten-katalog.json]
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const STUFEN = [['anfaenger', 'beginner'], ['fortgeschritten', 'experienced'], ['profi', 'pro']];
const SPRACHEN = ['th', 'en', 'es', 'de'];

function lies() {
  const begriffe = [];
  for (const [datei, stufe] of STUFEN) {
    const dateien = fs.readdirSync(DIR).filter((f) => f.startsWith(`begriffe-${datei}-`) && f.endsWith('.tsv')).sort();
    for (const f of dateien) {
      for (const zeile of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
        if (!zeile.trim() || zeile.startsWith('#')) continue;
        const [id, en, wortart, bild, nur] = zeile.split('\t');
        begriffe.push({ id, en, partOfSpeech: wortart, isConcrete: bild === '1', stage: stufe,
          ...(nur ? { onlyLanguages: nur.split(',').map((s) => s.trim()) } : {}) });
      }
    }
  }
  return begriffe;
}

/** Englische Bedeutung → Vergleichsschlüssel („to eat“ → „eat“, Klammern weg). */
function schluessel(text) {
  return String(text ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/^\s*(to|the|a|an)\s+/, '')
    .replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
}
function varianten(text) {
  return [...new Set(String(text ?? '').split(/[,;/]/).map(schluessel).filter(Boolean))];
}

function abgleich(begriffe, alterKatalog) {
  const woerter = alterKatalog.entries.filter((e) => e.kind === 'vocabulary').map((e) => e.document);
  const index = new Map(SPRACHEN.map((l) => [l, new Map()]));
  for (const w of woerter) {
    const bedeutung = w.language === 'en' ? w.term : w.translations?.en;
    for (const v of varianten(bedeutung)) {
      const m = index.get(w.language);
      if (!m) continue;
      if (!m.has(v)) m.set(v, []);
      m.get(v).push(w.id);
    }
  }
  for (const b of begriffe) {
    b.reuse = {};
    for (const l of SPRACHEN) {
      if (b.onlyLanguages && !b.onlyLanguages.includes(l)) continue;
      const treffer = new Set();
      for (const v of varianten(b.en)) for (const id of index.get(l).get(v) ?? []) treffer.add(id);
      if (treffer.size) b.reuse[l] = [...treffer];
    }
  }
}

const begriffe = lies();
const ids = new Set();
for (const b of begriffe) {
  if (!/^c:[a-z0-9]+(?:_[a-z0-9]+)*$/.test(b.id)) throw Error(`Ungültige Kennung: ${b.id}`);
  if (ids.has(b.id)) throw Error(`Doppelt: ${b.id}`);
  ids.add(b.id);
}
const katalogPfad = process.argv[2] ?? path.join(DIR, '..', '_Local', 'reuse', 'alter-katalog.json');
if (fs.existsSync(katalogPfad)) abgleich(begriffe, JSON.parse(fs.readFileSync(katalogPfad, 'utf8')));
fs.writeFileSync(path.join(DIR, 'begriffe.json'), JSON.stringify({ version: 1, erstellt: '2026-10-24', begriffe }, null, 1) + '\n');

const zahl = (stufe) => begriffe.filter((b) => b.stage === stufe).length;
console.log(`Begriffe: ${begriffe.length} (Anfänger ${zahl('beginner')}, Fortgeschritten ${zahl('experienced')}, Profi ${zahl('pro')}), bildfähig ${begriffe.filter((b) => b.isConcrete).length}`);
if (begriffe[0].reuse) {
  for (const l of SPRACHEN) {
    const moeglich = begriffe.filter((b) => !b.onlyLanguages || b.onlyLanguages.includes(l));
    const mit = moeglich.filter((b) => b.reuse[l]);
    console.log(`${l}: ${mit.length}/${moeglich.length} Begriffe mit altem Wort (${Math.round((100 * mit.length) / moeglich.length)} %)`);
  }
}
