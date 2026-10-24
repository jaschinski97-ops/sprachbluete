#!/usr/bin/env node
/**
 * Prüft und liefert selbst geschriebene Dialoge (24.10.2026).
 *
 * Eine Dialog-Datei `_Local/dialoge/<sprache>/<id>.json` enthält genau das
 * JSON, das sonst der Studio-Dialoggenerator von einer KI bekommt (title,
 * setting, scriptTurns, corrections, translations). Die Prüfung nutzt den
 * Parser des Studios (`parseSituation`) und trägt die gefundenen Zielwörter
 * ein (`mitZielwoertern`); Thai-Zeilen müssen zusätzlich die Tonregeln und
 * die Umschrift-Konvention bestehen.
 *
 *   node content-plan/dialoge.cjs pruefe <sprache> [<id> …]
 *   node content-plan/dialoge.cjs liefere <sprache> [<sprache> …]   (Helper muss laufen)
 */
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../scripts/content/domain.cjs');

const { parseSituation, mitZielwoertern } = domain.load('src/lib/conversation/generator');
const { sollAusSchriftUndUmschrift } = domain.load('src/lib/content/soll-toene-schrift');
const { romanSyllableProblem } = domain.load('src/lib/content/thai-romanization');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
const woerter = new Map(catalog.entries.filter((e) => e.kind === 'vocabulary').map((e) => [e.id, e.document]));
const MODELL = 'claude (Sonnet 5.5, Orchestrator-geprüft)';

function plan(sprache) {
  return JSON.parse(fs.readFileSync(path.join(root, '_Local/dialoge', sprache, 'plan.json'), 'utf8'));
}
function volleSpec(spec) {
  const voll = (w) => woerter.get(w.id) ?? (() => { throw Error(`Wort ${w.id} fehlt im Katalog`); })();
  return { ...spec, targetWords: spec.targetWords.map(voll), reviewWords: spec.reviewWords.map(voll) };
}

/** Eine Datei prüfen: liefert die fertige Situation und die Befunde. */
function pruefeDatei(sprache, spec) {
  const datei = path.join(root, '_Local/dialoge', sprache, `${spec.id}.json`);
  if (!fs.existsSync(datei)) return { fehlt: true };
  const fehler = []; const hinweise = [];
  let situation;
  try {
    const roh = fs.readFileSync(datei, 'utf8');
    const zeit = fs.statSync(datei).mtimeMs;
    situation = mitZielwoertern(parseSituation(roh, volleSpec(spec), MODELL, Math.round(zeit)), volleSpec(spec));
  } catch (error) {
    return { fehler: [`${spec.id}: ${error.message}`], hinweise };
  }
  const fehlend = spec.targetWords.filter((w) => !situation.vocabIds.includes(w.id));
  if (fehlend.length) hinweise.push(`${spec.id}: Zielwörter nicht gefunden: ${fehlend.map((w) => w.term).join(', ')}`);
  if (fehlend.length > 4) fehler.push(`${spec.id}: ${fehlend.length} von ${spec.targetWords.length} Zielwörtern fehlen (höchstens 4 erlaubt)`);
  if (sprache === 'th') {
    situation.scriptTurns.forEach((turn, i) => {
      const befund = sollAusSchriftUndUmschrift(turn.targetText ?? turn.thai, turn.roman, 'satz');
      if (befund?.art === 'strittig') fehler.push(`${spec.id} Zeile ${i + 1}: Ton-Widerspruch: ${befund.grund}`);
      for (const silbe of turn.roman.split(/[-\s]+/).map((s) => s.replace(/[.,!?;:"“”()…]/g, '')).filter(Boolean)) {
        const problem = romanSyllableProblem(silbe);
        if (problem) fehler.push(`${spec.id} Zeile ${i + 1}: Umschrift „${silbe}“: ${problem}`);
      }
    });
  }
  return { situation, fehler, hinweise };
}

async function post(route, body) {
  const antwort = await fetch('http://127.0.0.1:8082' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify(body),
  });
  const text = await antwort.text();
  if (!antwort.ok) throw Error(`${route} ${antwort.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const [befehl, ...rest] = process.argv.slice(2);
  if (befehl === 'pruefe') {
    const [sprache, ...ids] = rest;
    const specs = plan(sprache).filter((s) => !ids.length || ids.includes(s.id));
    let fehlerZahl = 0; let fertig = 0; let offen = 0;
    for (const spec of specs) {
      const r = pruefeDatei(sprache, spec);
      if (r.fehlt) { offen += 1; continue; }
      fertig += 1;
      for (const h of r.hinweise) console.log('Hinweis: ' + h);
      for (const f of r.fehler) console.log('FEHLER: ' + f);
      fehlerZahl += r.fehler.length;
    }
    console.log(`${sprache}: ${fertig} geprüft, ${offen} noch nicht geschrieben, ${fehlerZahl} Fehler.`);
    process.exit(fehlerZahl ? 1 : 0);
  }
  if (befehl === 'liefere') {
    const situationen = [];
    for (const sprache of rest) {
      for (const spec of plan(sprache)) {
        const r = pruefeDatei(sprache, spec);
        if (r.fehlt) continue;
        if (r.fehler.length) throw Error(`Nicht geliefert, Fehler: ${r.fehler[0]}`);
        situationen.push(r.situation);
      }
    }
    console.log(`${situationen.length} Dialoge werden geliefert.`);
    const { token } = await post('/delivery/start', {});
    const herzschlag = setInterval(() => { post('/delivery/touch', { token }).catch(() => {}); }, 30000);
    try {
      for (const document of situationen) await post('/delivery/item', { token, kind: 'situations', document });
    } finally {
      clearInterval(herzschlag);
      await post('/delivery/finish', { token });
      console.log('Abschluss fertig.');
    }
    return;
  }
  console.log('Aufruf: dialoge.cjs pruefe <sprache> [ids] | liefere <sprachen>');
  process.exit(2);
}
main().catch((error) => { console.error(error.message); process.exit(1); });
