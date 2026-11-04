#!/usr/bin/env node
'use strict';

/**
 * Vorbild-Kurven für den Shadowing-Vergleich (28.10.2026).
 *
 *   node scripts/content/vorbild-kurven.cjs            alle Satz-Clips (inkrementell)
 *   node scripts/content/vorbild-kurven.cjs --neu      alles neu rechnen
 *
 * Für jeden Satz-Clip (Beispielsatz, Dialogzeile) des Katalogs: mp3
 * dekodieren, mit DERSELBEN F0-Messung wie die App (`analysis.ts`) messen und
 * als kompakte Melodiekurve (`vorbild-kurve.ts`) ablegen. Für Thai zusätzlich
 * die Silbengrenzen aus der Silbenausrichtung der Tonprüfung.
 *
 * Ausgabe je Lernsprache: `assets/kurven/<lang>.kurven.yml` — JSON (JSON ist
 * gültiges YAML; `.yml` kennt Metro schon als Asset-Endung, so bleibt die
 * geschützte `metro.config.js` unberührt). Die App lädt die Datei der
 * Lernsprache erst in einer Sprechübung (`vorbild-kurven.ts`).
 *
 * Inkrementell: Ein Clip wird nur neu gerechnet, wenn sich seine Audiodatei
 * geändert hat (Hash-Präfix). Nach Studio-Läufen mit neuen Clips einfach
 * erneut starten. Ändert keinen Katalog, keine Tonprüfung, kein Paket.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const root = path.resolve(__dirname, '../..');
const ZIEL = path.join(root, 'assets/kurven');
// Die EINE Lernsprachen-Liste der App (src/lib/languages/types.ts).
const SPRACHEN = require('./domain.cjs').load('src/lib/languages/types').LANGUAGE_CODES;
const VERSION = 1;

/** Umschrift → Silben-Tokens: dieselbe Funktion wie in der App (`romanSilben`). */
function romanTokens(roman) {
  return require('./domain.cjs').load('src/lib/speaking/vorbild-kurve').romanSilben(roman);
}

/** Welche Clips eine Kurve bekommen, mit Umschrift für Thai. */
function auftraege(katalog) {
  const eintraege = Object.values(katalog.entries);
  const beispielRoman = new Map();
  const zeilenRoman = new Map();
  for (const eintrag of eintraege) {
    const doc = eintrag.document;
    if (!doc) continue;
    if (eintrag.kind === 'vocabulary' && doc.language === 'th' && doc.exampleTerm && doc.exampleRoman) {
      beispielRoman.set(doc.exampleTerm.normalize('NFC'), doc.exampleRoman);
    }
    if (eintrag.kind === 'situations' && Array.isArray(doc.scriptTurns)) {
      for (const zug of doc.scriptTurns) {
        const text = zug.targetText ?? zug.thai;
        if (text && zug.roman) zeilenRoman.set(text.normalize('NFC'), zug.roman);
      }
    }
  }
  const liste = [];
  for (const eintrag of eintraege) {
    if (eintrag.kind !== 'audio') continue;
    const doc = eintrag.document;
    if (doc.kind !== 'example' && doc.kind !== 'turn') continue;
    if (!SPRACHEN.includes(doc.language)) continue;
    const text = doc.text.normalize('NFC');
    const roman = doc.language === 'th' ? (doc.kind === 'example' ? beispielRoman.get(text) : zeilenRoman.get(text)) ?? null : null;
    liste.push({
      id: eintrag.id,
      sprache: doc.language,
      datei: path.join(root, 'assets/content', eintrag.asset),
      hash: String(eintrag.asset).slice(0, 8),
      roman,
    });
  }
  return liste;
}

// ------------------------------------------------------------------ Worker

function workerLauf() {
  const domain = require('./domain.cjs');
  const { decodeAudio } = require('./media.cjs');
  const analyse = domain.load('src/lib/speaking/analysis');
  const kurveMod = domain.load('src/lib/speaking/vorbild-kurve');
  const { richteSilbenAus } = domain.load('src/lib/content/silben-ausrichtung');
  const { silbenbauFolge } = domain.load('src/lib/content/silbenbau');
  const { tonfolgeAusRoman } = domain.load('src/lib/content/roman-tone');

  parentPort.on('message', (auftrag) => {
    if (auftrag === null) process.exit(0);
    try {
      const pcm = decodeAudio(auftrag.datei);
      const messung = analyse.analyzeToneContour(pcm, 24000);
      const kurve = kurveMod.kurveAusFrames(messung.frames);
      if (!kurve) {
        parentPort.postMessage({ id: auftrag.id, ergebnis: null });
        return;
      }
      let silben = null;
      if (auftrag.roman) {
        const tokens = romanTokens(auftrag.roman);
        const toene = tonfolgeAusRoman(tokens.join(' '));
        if (toene && toene.length === tokens.length) {
          const zuege = analyse.voicedRuns(messung.frames);
          const ausrichtung = richteSilbenAus(zuege, tokens.length, silbenbauFolge(tokens));
          if (ausrichtung) silben = kurveMod.silbenSpannenAus(ausrichtung.segmente, messung.frames);
        }
      }
      const eintrag = [auftrag.hash, kurveMod.kodiereKurve(kurve)];
      if (silben) eintrag.push(silben);
      parentPort.postMessage({ id: auftrag.id, ergebnis: eintrag });
    } catch (fehler) {
      parentPort.postMessage({ id: auftrag.id, fehler: String(fehler && fehler.message ? fehler.message : fehler) });
    }
  });
}

// --------------------------------------------------------------- Hauptlauf

function ladeBestand(sprache) {
  try {
    const daten = JSON.parse(fs.readFileSync(path.join(ZIEL, `${sprache}.kurven.yml`), 'utf8'));
    return daten.v === VERSION ? daten.kurven : {};
  } catch {
    return {};
  }
}

async function main() {
  const neu = process.argv.includes('--neu');
  const katalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
  const alle = auftraege(katalog);
  const bestand = Object.fromEntries(SPRACHEN.map((s) => [s, neu ? {} : ladeBestand(s)]));
  const ergebnis = Object.fromEntries(SPRACHEN.map((s) => [s, {}]));
  const offen = [];
  for (const auftrag of alle) {
    const alt = bestand[auftrag.sprache][auftrag.id];
    if (alt && alt[0] === auftrag.hash) ergebnis[auftrag.sprache][auftrag.id] = alt;
    else if (fs.existsSync(auftrag.datei)) offen.push(auftrag);
  }
  console.log(`${alle.length} Satz-Clips, ${alle.length - offen.length} unverändert, ${offen.length} zu rechnen`);

  let fertig = 0;
  let ohneKurve = 0;
  const fehler = [];
  const nachSprache = new Map(alle.map((a) => [a.id, a.sprache]));
  if (offen.length) {
    const anzahl = Math.max(1, Math.min(offen.length, os.cpus().length - 2, 10));
    const beginn = Date.now();
    await new Promise((alleFertig) => {
      let laufend = anzahl;
      for (let i = 0; i < anzahl; i++) {
        const worker = new Worker(__filename, { workerData: { worker: true } });
        const naechster = () => worker.postMessage(offen.length ? offen.shift() : null);
        worker.on('message', (antwort) => {
          fertig++;
          if (antwort.fehler) fehler.push(`${antwort.id}: ${antwort.fehler}`);
          else if (!antwort.ergebnis) ohneKurve++;
          else ergebnis[nachSprache.get(antwort.id)][antwort.id] = antwort.ergebnis;
          if (fertig % 500 === 0) console.log(`  ${fertig} … (${Math.round((Date.now() - beginn) / 1000)} s)`);
          naechster();
        });
        worker.on('exit', () => {
          if (--laufend === 0) alleFertig();
        });
        worker.on('error', (e) => fehler.push(String(e)));
        naechster();
      }
    });
  }

  fs.mkdirSync(ZIEL, { recursive: true });
  for (const sprache of SPRACHEN) {
    const kurven = Object.fromEntries(Object.entries(ergebnis[sprache]).sort(([a], [b]) => a.localeCompare(b)));
    const text = JSON.stringify({ v: VERSION, schrittMs: 20, kurven });
    fs.writeFileSync(path.join(ZIEL, `${sprache}.kurven.yml`), text + '\n');
    const mitSilben = Object.values(kurven).filter((e) => e[2]).length;
    console.log(`${sprache}: ${Object.keys(kurven).length} Kurven${sprache === 'th' ? `, ${mitSilben} mit Silben` : ''}, ${(text.length / 1024).toFixed(0)} KiB`);
  }
  if (ohneKurve) console.log(`${ohneKurve} Clips ohne messbare Kurve (zu wenig stimmhaft)`);
  if (fehler.length) {
    console.log(`${fehler.length} Fehler:\n  ${fehler.slice(0, 10).join('\n  ')}`);
    process.exitCode = 1;
  }
}

if (!isMainThread && workerData && workerData.worker) workerLauf();
else if (require.main === module) {
  main().catch((fehler) => {
    console.error(fehler);
    process.exit(1);
  });
}

module.exports = { romanTokens, auftraege };
