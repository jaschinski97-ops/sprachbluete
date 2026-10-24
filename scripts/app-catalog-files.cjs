const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { slimEntry } = require('./metro-app-catalog.cjs');

// KATALOG JE LERNSPRACHE (Schritt 1, docs/katalog-je-lernsprache-konzept.md):
// Der App-Bau trägt den Inhalt nicht mehr als JS-Modul, sondern je Lernsprache
// als eingebettete Datei `assets/catalog/<lang>.catalog`. Die App lädt beim
// Start nur die aktive Lernsprache (src/lib/content/catalog-languages.ts). Im
// Bundle bleibt der kleine Index (`appIndex`), den der Metro-Transformer statt
// `catalog.json` einsetzt (metro-app-catalog.cjs).
//
// metro.config.js ruft `writeCatalogFiles` bei jedem Metro-Start auf, vor der
// ersten Auflösung — Metro sieht nur Dateien, die beim Start schon da sind.
// Ein Stempel spart den Lauf, solange Katalog und Erzeuger gleich bleiben.
// Die Dateien sind erzeugt und gitignored; EAS baut sie auf der Baumaschine.
//
// Aufteilung (eine Funktion für Bau und Tests):
// - Wortschatz nach `document.language`, Situationen nach der Zielsprache
//   ihrer Richtung (`th_to_de` → de), Bilder nach der Sprache ihrer Vokabel.
// - Hörclips: alle der Sprache selbst, dazu die fremden Clips aus
//   `planDeliveryAudio` (die deutschen Bedeutungen der Karteikarten). Ein
//   de-Clip steht dadurch in mehreren Dateien; die Laufzeit nimmt ihn einmal.
// - Nicht Zuordenbares (unbekannte Art oder Sprache) kommt in jede Datei.
//
// SCHRITT 1b — Übersetzungen je App-Sprache: Die Übersetzungen machen bei den
// Dialogen ~89 % der Größe aus, gebraucht werden aber nur App-Sprache und
// Englisch (`bridgeText` fällt auf Englisch zurück). Jede Lernsprache hat
// deshalb eine Basis `<lang>.catalog` ohne die `translations` der 20
// App-Sprachen und je App-Sprache einen Teil `<lang>-<ui>.catalog`. Die
// Hörclips stehen in der Basis als kompakte Tabelle
// `[id, Sprache, Datei, Status, Tonstatus]` statt als ganze Einträge.

const FORMAT = 2;
const OUT_DIR = path.join('assets', 'catalog');
const STAMP = 'stamp.json';
const INDEX = 'index.json';

/** Die TS-Module, deren Regeln die Aufteilung bestimmen; sie gehen in den Erzeuger-Hash ein. */
const DOMAIN_FILES = [
  'src/lib/content/audio-plan.ts',
  'src/lib/content/audio-policy.ts',
  'src/lib/clips/plan.ts',
  'src/lib/clips/types.ts',
  'src/lib/conversation/types.ts',
  'src/lib/i18n/types.ts',
  'src/lib/languages/types.ts',
];
const ROOT = path.resolve(__dirname, '..');
const GENERATOR_KEY = createHash('sha1')
  .update([__filename, require.resolve('./metro-app-catalog.cjs'), ...DOMAIN_FILES.map((file) => path.join(ROOT, file))]
    .map((file) => fs.readFileSync(file)).join('\0'))
  .digest('hex').slice(0, 12);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Die App-Regeln, aus den TS-Modulen des Projekts (scripts/content/domain.cjs). */
function domainRules() {
  const domain = require('./content/domain.cjs');
  return {
    languages: domain.load('src/lib/languages/types').LANGUAGE_CODES,
    uiLanguages: domain.load('src/lib/i18n/types').UI_LANGUAGES,
    isDeliverableEntry: domain.load('src/lib/content/audio-policy').isDeliverableEntry,
    planDeliveryAudio: domain.load('src/lib/content/audio-plan').planDeliveryAudio,
  };
}

const targetOf = (direction) => (typeof direction === 'string' ? direction.split('_to_')[1] : undefined);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Ein schlanker Clip-Eintrag als Tabellenzeile, oder `null`, wenn er nicht
 * verlustfrei passt (dann bleibt er ein ganzer Eintrag). Umkehrung:
 * `audioEntryFromRow` in src/lib/content/catalog-languages.ts.
 */
function audioRow(entry) {
  if (entry.kind !== 'audio' || !isObject(entry.document)) return null;
  const { document, asset, check } = entry;
  const keys = Object.keys(document).sort().join(',');
  if (keys !== 'id,language' || document.id !== entry.id || typeof document.language !== 'string') return null;
  if (asset !== undefined && typeof asset !== 'string') return null;
  if (Object.keys(entry).some((key) => !['kind', 'id', 'document', 'asset', 'check'].includes(key))) return null;
  if (check !== undefined) {
    if (typeof check.status !== 'string' || Object.keys(check).some((key) => key !== 'status' && key !== 'tone')) return null;
    if (check.tone !== undefined && (typeof check.tone.status !== 'string' || Object.keys(check.tone).length !== 1)) return null;
  }
  return [entry.id, document.language, asset ?? null, check ? check.status : null, check?.tone ? check.tone.status : null];
}

/**
 * Nimmt die App-Sprachen aus `value` heraus und legt sie in `target[ui][id]`.
 * Was keine App-Sprache ist, bleibt; das leere Objekt auch, damit die
 * Laufzeit die Teile dort hineinlegt.
 */
function moveUiTexts(value, uiLanguages, target, id) {
  const rest = { ...value };
  for (const ui of uiLanguages) {
    if (!(ui in rest)) continue;
    target[ui][id] = rest[ui];
    delete rest[ui];
  }
  return rest;
}

/**
 * Basis-Einträge ohne die Übersetzungen der App-Sprachen, dazu die Teile je
 * App-Sprache. Seit 24.10.2026 wandern auch die Satzübersetzungen des
 * Wortschatzes (`exampleTranslations`) in die Teile (Feld `exampleTranslations`).
 */
function splitTranslations(entries, uiLanguages) {
  const parts = Object.fromEntries(uiLanguages.map((ui) => [ui, { vocabulary: {}, situations: {}, exampleTranslations: {} }]));
  const byUi = (field) => Object.fromEntries(uiLanguages.map((ui) => [ui, parts[ui][field]]));
  const base = [];
  const audio = [];
  for (const entry of entries) {
    const row = audioRow(entry);
    if (row) {
      audio.push(row);
      continue;
    }
    if (entry.kind !== 'vocabulary' && entry.kind !== 'situations') {
      base.push(entry);
      continue;
    }
    const document = { ...entry.document };
    if (isObject(document.translations)) document.translations = moveUiTexts(document.translations, uiLanguages, byUi(entry.kind), entry.id);
    if (entry.kind === 'vocabulary' && isObject(document.exampleTranslations)) {
      document.exampleTranslations = moveUiTexts(document.exampleTranslations, uiLanguages, byUi('exampleTranslations'), entry.id);
    }
    base.push({ ...entry, document });
  }
  return { base, audio, parts };
}

/**
 * Teilt den vollen Katalog in eine schlanke Datei je Lernsprache und den Index.
 * `rules` kommt aus `domainRules()` oder, im Jest-Test, direkt aus den TS-Modulen.
 */
function splitCatalog(catalog, rules, sourceCatalogSha256) {
  const { languages, uiLanguages, isDeliverableEntry, planDeliveryAudio } = rules;
  const known = new Set(languages);
  const vocabularyLanguage = new Map();
  // Bilder je Begriff (24.10.2026): welche Sprachen Wörter mit diesem Begriff haben.
  const conceptLanguages = new Map();
  for (const entry of catalog.entries) {
    if (entry.kind !== 'vocabulary') continue;
    if (!vocabularyLanguage.has(entry.id)) vocabularyLanguage.set(entry.id, entry.document?.language);
    const concept = entry.document?.concept;
    if (typeof concept === 'string' && concept.startsWith('c:')) {
      if (!conceptLanguages.has(concept)) conceptLanguages.set(concept, new Set());
      conceptLanguages.get(concept).add(entry.document.language);
    }
  }
  /** Ein oder mehrere Lernsprachen; ein gemeinsames Begriffsbild gehört jeder, die es zeigt. */
  const languagesOf = (entry) => {
    if (entry.kind === 'vocabulary') return [entry.document?.language];
    if (entry.kind === 'situations') return [targetOf(entry.document?.direction)];
    if (entry.kind === 'audio') return [entry.document?.language];
    if (entry.kind === 'images') {
      const doc = entry.document ?? {};
      if (typeof doc.concept === 'string' && doc.concept.startsWith('c:')) {
        return doc.language ? [doc.language] : [...(conceptLanguages.get(doc.concept) ?? [])];
      }
      return [vocabularyLanguage.get(doc.vocabId)];
    }
    return [];
  };

  const own = new Map(languages.map((language) => [language, []]));
  const everywhere = [];
  for (const entry of catalog.entries) {
    const targets = languagesOf(entry).filter((language) => known.has(language));
    if (targets.length) for (const language of targets) own.get(language).push(entry);
    else everywhere.push(entry);
  }

  // Auslieferbarer Wortschatz wie `activeVocabulary()`: bei doppelter ID der erste.
  const words = new Map(languages.map((language) => [language, []]));
  const seenWords = new Set();
  for (const entry of catalog.entries) {
    if (entry.kind !== 'vocabulary' || !isDeliverableEntry(entry) || seenWords.has(entry.id)) continue;
    seenWords.add(entry.id);
    words.get(entry.document.language)?.push(entry.document);
  }
  const audioById = new Map();
  for (const entry of catalog.entries) if (entry.kind === 'audio' && !audioById.has(entry.id)) audioById.set(entry.id, entry);

  const files = {};
  const translations = {};
  const indexLanguages = {};
  for (const language of languages) {
    const entries = [...own.get(language)];
    const ids = new Set(entries.map((entry) => `${entry.kind}:${entry.id}`));
    const situations = entries.filter((entry) => entry.kind === 'situations' && isDeliverableEntry(entry)).map((entry) => entry.document);
    for (const spec of planDeliveryAudio(situations, language, words.get(language))) {
      const clip = audioById.get(spec.id);
      if (clip && !ids.has(`audio:${clip.id}`)) {
        ids.add(`audio:${clip.id}`);
        entries.push(clip);
      }
    }
    entries.push(...everywhere);
    const { base, audio, parts } = splitTranslations(entries.map(slimEntry), uiLanguages);
    files[language] = { format: FORMAT, language, sourceCatalogSha256, entries: base, audio };
    translations[language] = Object.fromEntries(uiLanguages.map((ui) => [ui, { format: FORMAT, language, ui, sourceCatalogSha256, ...parts[ui] }]));
    indexLanguages[language] = { vocabulary: words.get(language).map((word) => word.id) };
  }

  const { entries: _entries, ...rest } = catalog;
  const index = { ...rest, entries: [], appIndex: { format: FORMAT, sourceCatalogSha256, languages: indexLanguages } };
  return { files, translations, index };
}

/** `th.catalog` (Basis) oder `th-de.catalog` (Übersetzungen der App-Sprache de). */
function fileName(language, ui) {
  return ui ? `${language}-${ui}.catalog` : `${language}.catalog`;
}

const MAP_FILE = path.join('src', 'content', 'catalog-files.ts');

/** Der Inhalt von `src/content/catalog-files.ts`: statische requires, wie `assets.ts`. */
function renderFileMap(languages, uiLanguages) {
  const req = (language, ui) => `require('../../assets/catalog/${fileName(language, ui)}')`;
  const lines = languages.flatMap((language) => [
    `  ${language}: {`,
    `    base: ${req(language)},`,
    '    translations: {',
    ...uiLanguages.map((ui) => `      ${ui}: ${req(language, ui)},`),
    '    },',
    '  },',
  ]);
  return [
    '// Erzeugt von `node scripts/app-catalog-files.cjs --write-map`. Nicht von Hand ändern;',
    '// scripts/app-catalog-files.test.cjs vergleicht die Datei mit dem Erzeuger.',
    '// Statische requires: Metro legt die Sprachdateien als Asset in den App-Build',
    '// (Android res/raw, iOS App-Bundle, Web dist/assets).',
    "import type { UiLanguage } from '@/lib/i18n/types';",
    "import type { LanguageCode } from '@/lib/languages/types';",
    '',
    '/** Basis einer Lernsprache und ihre Übersetzungsteile je App-Sprache (Schritt 1b). */',
    'export type CatalogFileSet = { base: number; translations: Record<UiLanguage, number> };',
    '',
    'export const CATALOG_FILES: Record<LanguageCode, CatalogFileSet> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
}

function readStamp(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STAMP), 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(file, content) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}

/**
 * Schreibt Sprachdateien, Index und Stempel nach `assets/catalog/`, außer der
 * Stempel passt schon zu Katalog und Erzeuger.
 */
function writeCatalogFiles({ root = ROOT, catalogPath = path.join(root, 'src/content/catalog.json'), force = false, rules, log = console.log } = {}) {
  const started = Date.now();
  const source = fs.readFileSync(catalogPath);
  const sourceCatalogSha256 = sha256(source);
  const dir = path.join(root, OUT_DIR);
  const stamp = readStamp(dir);
  const fresh = stamp && stamp.format === FORMAT && stamp.generator === GENERATOR_KEY && stamp.sourceCatalogSha256 === sourceCatalogSha256
    && Object.entries(stamp.files ?? {}).every(([name, bytes]) => fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.size === bytes);
  if (fresh && !force) return { written: false, sourceCatalogSha256, dir };

  const { files, translations, index } = splitCatalog(JSON.parse(source.toString('utf8')), rules ?? domainRules(), sourceCatalogSha256);
  fs.mkdirSync(dir, { recursive: true });
  const sizes = {};
  const write = (name, value) => {
    const content = JSON.stringify(value);
    writeAtomic(path.join(dir, name), content);
    sizes[name] = Buffer.byteLength(content);
  };
  for (const [language, file] of Object.entries(files)) {
    write(fileName(language), file);
    for (const [ui, part] of Object.entries(translations[language])) write(fileName(language, ui), part);
  }
  // Dateien eines früheren Formats fliegen raus; Metro sähe sie sonst weiter.
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.catalog') && !(name in sizes)) fs.unlinkSync(path.join(dir, name));
  }
  const indexContent = JSON.stringify(index);
  writeAtomic(path.join(dir, INDEX), indexContent);
  sizes[INDEX] = Buffer.byteLength(indexContent);
  writeAtomic(path.join(dir, STAMP), JSON.stringify({ format: FORMAT, generator: GENERATOR_KEY, sourceCatalogSha256, files: sizes }, null, 2));
  const total = Object.values(sizes).reduce((sum, bytes) => sum + bytes, 0);
  log(`[app-catalog] ${Object.keys(sizes).length - 1} Dateien für ${Object.keys(files).length} Lernsprachen + Index, ${(total / 1e6).toFixed(1)} MB in ${Date.now() - started} ms`);
  return { written: true, sourceCatalogSha256, dir, sizes };
}

/**
 * Der Index für den Transformer: nur, wenn der Stempel genau zu den Bytes von
 * `catalog.json` passt, die Metro gerade baut. Sonst bricht der Bau ab — nie
 * ein alter Text im App-Build.
 */
function appCatalogIndex(projectRoot, catalogData) {
  const dir = path.join(projectRoot, OUT_DIR);
  const stamp = readStamp(dir);
  const sha = sha256(catalogData);
  if (!stamp || stamp.generator !== GENERATOR_KEY || stamp.sourceCatalogSha256 !== sha) {
    throw new Error(
      `Die Katalogdateien in ${OUT_DIR} passen nicht zu src/content/catalog.json (Stempel ${stamp?.sourceCatalogSha256?.slice(0, 12) ?? 'fehlt'}, ` +
      `Katalog ${sha.slice(0, 12)}). Metro neu starten; metro.config.js erzeugt sie dann neu (scripts/app-catalog-files.cjs).`
    );
  }
  return fs.readFileSync(path.join(dir, INDEX));
}

if (require.main === module) {
  if (process.argv.includes('--write-map')) {
    const { languages, uiLanguages } = domainRules();
    fs.writeFileSync(path.join(ROOT, MAP_FILE), renderFileMap(languages, uiLanguages));
    console.log(`[app-catalog] ${MAP_FILE} geschrieben`);
  } else {
    const result = writeCatalogFiles({ force: process.argv.includes('--force') });
    if (!result.written) console.log(`[app-catalog] aktuell (${result.sourceCatalogSha256.slice(0, 12)})`);
  }
}

module.exports = { FORMAT, GENERATOR_KEY, MAP_FILE, OUT_DIR, appCatalogIndex, audioRow, domainRules, fileName, renderFileMap, splitCatalog, writeCatalogFiles };
