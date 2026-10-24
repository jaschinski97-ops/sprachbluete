#!/usr/bin/env node
/**
 * Plant die Wortschatz-Dialoge aus dem Katalog (24.10.2026) — dieselbe
 * Planung wie das Studio (`planeWortDialoge`): je Dialog die nächsten 20 noch
 * nicht abgedeckten Wörter der Stufe plus 4 zum Wiederholen.
 *
 * Aufruf: node content-plan/plane-dialoge.cjs [anfaenger fortgeschritten profi]
 * Vorgabe 25 / 15 / 10. Ausgabe: `_Local/dialoge/<sprache>/plan.json`.
 */
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../scripts/content/domain.cjs');

const { planeWortDialoge } = domain.load('src/lib/conversation/dialog-words');
const { LANGUAGE_CODES } = domain.load('src/lib/languages/types');

const [a = 25, f = 15, p = 10] = process.argv.slice(2).map(Number);
const ANZAHL = { beginner: a, experienced: f, pro: p };
const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/content/catalog.json'), 'utf8'));
const vocabulary = catalog.entries.filter((e) => e.kind === 'vocabulary').map((e) => e.document);
const situations = catalog.entries.filter((e) => e.kind === 'situations').map((e) => e.document);

const kurz = (w) => ({ id: w.id, term: w.term, german: w.german, ...(w.romanization ? { romanization: w.romanization } : {}) });
for (const language of LANGUAGE_CODES) {
  const plan = [];
  for (const stage of ['beginner', 'experienced', 'pro']) {
    for (const spec of planeWortDialoge({ language, stage, anzahl: ANZAHL[stage], vocabulary, situations })) {
      plan.push({ ...spec, stage, targetWords: spec.targetWords.map(kurz), reviewWords: spec.reviewWords.map(kurz) });
    }
  }
  const dir = path.join(root, '_Local', 'dialoge', language);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  console.log(`${language}: ${plan.length} Dialoge geplant`);
}
