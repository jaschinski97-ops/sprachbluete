const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ALLE, abweichungen } = require('./schutz.cjs');

test('geschützte Dateien sind unverändert (sonst: Freigabe des Nutzers, dann npm run schutz:freigeben)', () => {
  const liste = abweichungen();
  assert.deepEqual(liste, [], [
    'Diese geschützten Dateien wurden geändert:',
    ...liste.map((datei) => '  ' + datei),
    'Sie laufen und sind abgesichert (docs/geschuetzte-bereiche.md). Nur ändern, wenn der Nutzer es',
    'ausdrücklich freigegeben hat; danach Tests laufen lassen und `node scripts/schutz.cjs freigeben <datei>`.',
  ].join('\n'));
});

test('die Doku nennt jede geschützte Datei', () => {
  const doku = fs.readFileSync(path.join(__dirname, '..', 'docs', 'geschuetzte-bereiche.md'), 'utf8');
  assert.deepEqual(ALLE.filter((datei) => !doku.includes(datei)), []);
});
