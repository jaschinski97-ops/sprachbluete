#!/usr/bin/env node
/**
 * Schutz fertiger Bereiche (25.10.2026).
 *
 * Diese Dateien laufen, sind durch Tests und Messungen abgesichert und sollen
 * bei Erweiterungen nicht versehentlich mitgeändert werden. Für jede Datei
 * steht ihr Fingerabdruck (SHA-256, Zeilenenden vereinheitlicht) in
 * `scripts/schutz-stand.json`. Der Test `scripts/schutz.test.cjs` schlägt
 * fehl, sobald eine geschützte Datei davon abweicht.
 *
 * Ändern ist nicht verboten, aber nur mit ausdrücklicher Freigabe des
 * Nutzers (siehe `docs/geschuetzte-bereiche.md`). Danach den neuen Stand
 * eintragen:
 *
 *   node scripts/schutz.cjs pruefe              Abweichungen zeigen (Exit 1, wenn welche da sind)
 *   node scripts/schutz.cjs freigeben <datei…>  neuen Stand dieser Dateien eintragen
 *   node scripts/schutz.cjs freigeben --alle    neuen Stand aller geschützten Dateien eintragen
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STAND = path.join(__dirname, 'schutz-stand.json');

/** Die geschützten Bereiche — dieselbe Liste steht erklärt in docs/geschuetzte-bereiche.md. */
const BEREICHE = [
  {
    name: 'Lernplanung (FSRS, Auswahl der Übungswörter)',
    dateien: ['src/lib/fsrs/fsrs.ts', 'src/lib/fsrs/types.ts', 'src/lib/practice-selection.ts', 'src/lib/word-practice.ts'],
  },
  {
    name: 'Thai-Töne und Umschrift (Tonregeln, Ton-Gate, Tonmessung)',
    dateien: [
      'src/lib/thai/tone-rules.ts', 'src/lib/thai/tone-exceptions.ts', 'src/lib/content/tone-gate.ts',
      'src/lib/content/tone-template.ts', 'src/lib/content/silben-ausrichtung.ts', 'src/lib/content/silbenbau.ts',
      'src/lib/content/roman-tone.ts', 'src/lib/content/soll-toene-schrift.ts', 'src/lib/content/thai-romanization.ts',
      'src/lib/speaking/analysis.ts',
    ],
  },
  {
    name: 'Speicherung der Lernstände (IndexedDB, Migration, Sicherung)',
    dateien: [
      'src/lib/storage/backend.ts', 'src/lib/storage/backend.web.ts', 'src/lib/storage/document-persistence.web.ts',
      'src/lib/storage/index.ts', 'src/lib/storage/memory-store.ts', 'src/lib/storage/migration.ts',
      'src/lib/storage/types.ts', 'src/lib/backup.ts',
    ],
  },
  {
    name: 'Katalog je Lernsprache und App-Build',
    dateien: [
      'metro.config.js', 'scripts/metro-app-catalog.cjs', 'scripts/app-catalog-files.cjs',
      'src/lib/content/catalog-languages.ts', 'src/lib/content/catalog-loader.ts', 'src/components/catalog-gate.tsx',
    ],
  },
  {
    name: 'Inhalts-Pipeline (Prüfung und Übernahme in den Katalog)',
    dateien: [
      'scripts/content/pipeline.cjs', 'scripts/content/automatic-delivery.cjs', 'src/lib/content/vocab-schema.ts',
      'src/lib/content/audio-policy.ts', 'src/lib/generation/drossel.ts',
    ],
  },
  {
    name: 'Sprachpakete',
    dateien: ['src/lib/packs/store.ts', 'src/lib/packs/manifest.ts', 'src/lib/packs/config.ts', 'scripts/content/build-pack.cjs'],
  },
  {
    name: 'Feste, quellengeprüfte Lerndaten',
    dateien: ['src/data/numbers.ts', 'src/data/latin-alphabet.ts', 'src/data/thai-script.ts'],
  },
];

const ALLE = BEREICHE.flatMap((bereich) => bereich.dateien);

/** Fingerabdruck mit vereinheitlichten Zeilenenden (Windows-Checkouts zählen nicht als Änderung). */
function fingerabdruck(datei) {
  const text = fs.readFileSync(path.join(ROOT, datei), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function leseStand() {
  return fs.existsSync(STAND) ? JSON.parse(fs.readFileSync(STAND, 'utf8')) : {};
}

/** Geschützte Dateien, deren Inhalt vom eingetragenen Stand abweicht (oder die fehlen). */
function abweichungen(stand = leseStand()) {
  return ALLE.filter((datei) => !fs.existsSync(path.join(ROOT, datei)) || stand[datei] !== fingerabdruck(datei));
}

function freigeben(dateien) {
  const stand = leseStand();
  for (const datei of dateien) {
    if (!ALLE.includes(datei)) throw Error(`${datei} ist keine geschützte Datei.`);
    stand[datei] = fingerabdruck(datei);
  }
  // Nur Einträge der Liste behalten, sortiert für ruhige Diffs.
  const sortiert = Object.fromEntries(ALLE.filter((datei) => stand[datei]).sort().map((datei) => [datei, stand[datei]]));
  fs.writeFileSync(STAND, JSON.stringify(sortiert, null, 2) + '\n');
}

if (require.main === module) {
  const [befehl, ...rest] = process.argv.slice(2);
  if (befehl === 'pruefe') {
    const liste = abweichungen();
    if (!liste.length) { console.log(`Alle ${ALLE.length} geschützten Dateien unverändert.`); process.exit(0); }
    console.log('Geänderte geschützte Dateien:\n' + liste.map((datei) => '  ' + datei).join('\n'));
    process.exit(1);
  }
  if (befehl === 'freigeben') {
    const dateien = rest.includes('--alle') ? ALLE : rest;
    if (!dateien.length) { console.log('Welche Dateien? Pfade angeben oder --alle.'); process.exit(2); }
    freigeben(dateien);
    console.log(`Neuer Stand eingetragen: ${dateien.length} Datei(en).`);
    process.exit(0);
  }
  console.log('Aufruf: node scripts/schutz.cjs pruefe | freigeben <datei…> | freigeben --alle');
  process.exit(2);
}

module.exports = { BEREICHE, ALLE, abweichungen, fingerabdruck };
