#!/usr/bin/env node
/**
 * Liefert geprüfte Wortschatz-Dateien über den Studio-Helper in den Katalog
 * (24.10.2026) — derselbe Weg wie die automatische Übernahme des Studios:
 * `/delivery/start`, je Eintrag `/delivery/item`, am Ende `/delivery/finish`.
 * Jeder Eintrag läuft dabei durch die Prüfungen des Helpers.
 *
 * Aufruf: node content-plan/liefere-woerter.cjs <ordner|datei> [...]
 * Voraussetzung: Helper läuft auf 127.0.0.1:8082 (`node scripts/content/studio.cjs`).
 */
const fs = require('node:fs');
const path = require('node:path');

const HELPER = 'http://127.0.0.1:8082';
const ORIGIN = 'http://localhost:8081';

async function post(route, body) {
  const antwort = await fetch(HELPER + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
  });
  const text = await antwort.text();
  if (!antwort.ok) throw Error(`${route} ${antwort.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function dateien(argumente) {
  return argumente.flatMap((arg) => fs.statSync(arg).isDirectory()
    ? fs.readdirSync(arg).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(arg, f))
    : [arg]);
}

async function main() {
  const liste = dateien(process.argv.slice(2));
  if (!liste.length) throw Error('Keine Dateien angegeben.');
  const eintraege = liste.flatMap((datei) => JSON.parse(fs.readFileSync(datei, 'utf8')));
  console.log(`${eintraege.length} Einträge aus ${liste.length} Dateien.`);
  const { token } = await post('/delivery/start', {});
  const herzschlag = setInterval(() => { post('/delivery/touch', { token }).catch(() => {}); }, 30000);
  let geliefert = 0;
  try {
    for (const document of eintraege) {
      try {
        await post('/delivery/item', { token, kind: 'vocabulary', document });
      } catch (fehler) {
        throw Error(`Eintrag ${document.id} (${document.term}) abgelehnt: ${fehler.message}`);
      }
      geliefert += 1;
      if (geliefert % 250 === 0) console.log(`${geliefert}/${eintraege.length} …`);
    }
  } finally {
    clearInterval(herzschlag);
    console.log(`Geliefert: ${geliefert}. Abschluss …`);
    // Auch nach einem Fehler abschließen: Bereits geprüfte Einträge gehen in den Katalog.
    try { await post('/delivery/finish', { token }); console.log('Abschluss fertig.'); }
    catch (fehler) { console.log(`Abschluss: ${fehler.message} (Helper schreibt den Stand selbst, siehe pipeline/logs).`); }
  }
}

main().catch((fehler) => { console.error(fehler.message); process.exit(1); });
