#!/usr/bin/env node
/**
 * Vorlage für die Dialoge einer neuen Lernsprache aus den fertigen spanischen
 * Dialogen (07.11.2026). Der spanische Dialog mit derselben ID (…de_to_es-NNN)
 * hat schon alle 10 App-Sprachen und teilt meist 16–20 von 20 Zielwörtern mit
 * dem Plan der neuen Sprache. Die Vorlage steht im Quellformat von
 * `baue-dialoge.cjs`; offen bleiben die Zeile der Lernsprache (bei App-Sprachen
 * steht dort die vorhandene Übersetzung als Ausgangspunkt), die Umschrift je
 * Zug („?“) und eigene Hinweise zur Lernsprache.
 *
 *   node content-plan/dialog-vorlage.cjs <sprache>
 *     liest _Local/dialoge/<sprache>/plan.json, schreibt _Local/dialoge/<sprache>/vorlage/<id>.txt
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const UI = ['de', 'en', 'es', 'th', 'ar', 'zh', 'hi', 'fr', 'bn', 'pt', 'it', 'ja'];
const ZEICHEN_OHNE_SCHRAEGSTRICH = ['th', 'zh', 'ja'];

let situationen = null;
function katalog() {
  if (!situationen) {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/catalog.json'), 'utf8'));
    situationen = new Map(c.entries.filter((e) => e.kind === 'situations').map((e) => [e.id, e.document]));
  }
  return situationen;
}

function vorlagen(sprache) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, '_Local/dialoge', sprache, 'plan.json'), 'utf8'));
  const ziel = path.join(ROOT, '_Local/dialoge', sprache, 'vorlage');
  fs.mkdirSync(ziel, { recursive: true });
  const reihenfolge = UI.includes(sprache) ? [sprache, ...UI.filter((c) => c !== sprache)] : [sprache, ...UI];
  const leer = ZEICHEN_OHNE_SCHRAEGSTRICH.includes(sprache) ? '?' : '/?/';
  let n = 0;
  for (const spec of plan) {
    const esId = spec.id.replace(`de_to_${sprache}`, 'de_to_es');
    // Aus dem Katalog statt aus `_Local/dialoge/es/`: Nur dort stehen die
    // später ergänzten App-Sprachen (it, ja seit 07.11.2026).
    const d = katalog().get(esId);
    if (!d) { console.log(`fehlt: ${esId}`); continue; }
    const t = d.translations;
    const zeilen = [
      `# VORLAGE aus ${esId} (Spanisch). Zielwörter (${spec.targetWords.length}, höchstens 4 dürfen fehlen):`,
      `# ${spec.targetWords.map((w) => `${w.term} (${w.german})`).join(' · ')}`,
    ];
    if (spec.reviewWords?.length) zeilen.push(`# Wiederholen: ${spec.reviewWords.map((w) => `${w.term} (${w.german})`).join(' · ')}`);
    zeilen.push('');
    for (const code of UI) zeilen.push(`= ${code} ${t[code].title} || ${t[code].setting}`);
    d.scriptTurns.forEach((turn, i) => {
      zeilen.push('', `${turn.speaker === 'partner' ? 'P' : 'L'} ${leer}`);
      for (const code of reihenfolge) {
        if (!UI.includes(code)) zeilen.push(`${code} ?`);
        else zeilen.push(`${code} ${code === 'es' ? turn.targetText : t[code].turns[i]}`);
      }
    });
    zeilen.push('', '# Spanische Hinweise (NICHT übernehmen — nur als Muster; eigene Hinweise zur Lernsprache schreiben):');
    for (const c of d.corrections) zeilen.push(`# ${c.issue} || ${c.explanation}`);
    fs.writeFileSync(path.join(ziel, `${spec.id}.txt`), `${zeilen.join('\n')}\n`);
    n += 1;
  }
  console.log(`${n} Vorlagen in ${path.relative(ROOT, ziel)}`);
}

const [sprache] = process.argv.slice(2);
if (!sprache || sprache === 'es') {
  console.log('Aufruf: node content-plan/dialog-vorlage.cjs <sprache>');
  process.exitCode = 1;
} else vorlagen(sprache);
