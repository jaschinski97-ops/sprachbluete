// Baut ein Sprachpaket ("Content Pack") fuer eine Zielsprache.
//
//   node scripts/content/build-pack.cjs --lang th|all [--out dist/packs] [--version N]
//
// Erzeugt unter <out>/<lang>/:
//   thai-pack-<lang>-v<N>.zip             das Paket (manifest.json + audio/*.mp3 + images/*.webp)
//   thai-pack-<lang>-v<N>.manifest.json   dasselbe Manifest plus zipBytes/zipSha256 (Fuer den
//                                         Byte-Check auf dem Geraet VOR dem Entpacken)
//   index.json                            Versionsliste fuer den lokalen Helper (baseUrlOverride)
//
// Das Zip enthaelt nur Hörclips und Bilder der Zielsprache. Der Katalog
// (src/content/catalog.json) bleibt wie bisher eingebettet — das Paket
// transportiert nur die Bytes. Die Entscheidung, welcher Eintrag ausgeliefert
// wird, trifft dieselbe Regel wie die App (isDeliverableEntry aus
// src/lib/content/audio-policy), damit Paket und eingebetteter Fallback nie
// auseinanderlaufen.
//
// Das Zip wird bewusst ohne Kompression (STORE) und ohne Zeitstempel
// geschrieben: gleicher Inhalt -> byte-identisches Archiv, und mp3/webp sind
// ohnehin schon komprimiert. Keine neue Abhaengigkeit noetig.

const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ffmpeg = require('ffmpeg-static');
const domain = require('./domain.cjs');

const PACK_SCHEMA_VERSION = 1;
const IMAGE_MAX_EDGE = 512;
const IMAGE_QUALITY = 80;

/* ---------- Hilfen ---------- */

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sprache eines Katalog-Eintrags; alte Bilder laufen ueber die Vokabel-Sprache.
 * Ein gemeinsames Begriffsbild hat keine einzelne Sprache (null) — welche
 * Pakete es brauchen, entscheidet `imageLanguages`.
 */
function entryLanguage(entry, vocabLanguageById) {
  if (entry.kind === 'audio' && entry.document && typeof entry.document.language === 'string') {
    return entry.document.language;
  }
  if (entry.kind === 'images' && entry.document) {
    if (isConceptDoc(entry.document)) return entry.document.language ?? null;
    if (typeof entry.document.vocabId === 'string') return vocabLanguageById.get(entry.document.vocabId) ?? null;
  }
  return null;
}

function isConceptDoc(doc) {
  return typeof doc?.concept === 'string' && doc.concept.startsWith('c:');
}

/** Begriff -> Lernsprachen mit einem Wort dieses Begriffs (aus dem Katalog-Wortschatz). */
function conceptLanguagesOf(catalog) {
  const map = new Map();
  for (const entry of catalog.entries) {
    if (entry.kind !== 'vocabulary' || !isConceptDoc(entry.document)) continue;
    if (!map.has(entry.document.concept)) map.set(entry.document.concept, new Set());
    map.get(entry.document.concept).add(entry.document.language);
  }
  return map;
}

/**
 * Waehlt die Paket-Eintrage einer Sprache aus dem Katalog.
 * Reihenfolge: Katalog-Reihenfolge, innerhalb davon deterministisch sortiert.
 *
 * Bilder je Begriff (24.10.2026): Ein gemeinsames Bild liegt in JEDEM Paket,
 * dessen Sprache ein Wort mit diesem Begriff hat — ein Bild kann also in
 * mehreren Paketen stecken. Hat die Sprache eine eigene Ausnahme fuer den
 * Begriff, bleibt das gemeinsame Bild draussen (die App zeigt es dort nie).
 */
function selectPackEntries(catalog, language, vocabLanguageById, isDeliverable, conceptLanguages = conceptLanguagesOf(catalog)) {
  const audio = [];
  const images = [];
  const deliverable = catalog.entries.filter((entry) => !isDeliverable || isDeliverable(entry));
  const ownExceptions = new Set(deliverable
    .filter((entry) => entry.kind === 'images' && isConceptDoc(entry.document) && entry.document.language === language)
    .map((entry) => entry.document.concept));
  for (const entry of deliverable) {
    if (entry.kind !== 'audio' && entry.kind !== 'images') continue;
    const doc = entry.document;
    if (entry.kind === 'images' && isConceptDoc(doc) && !doc.language) {
      if (!conceptLanguages.get(doc.concept)?.has(language) || ownExceptions.has(doc.concept)) continue;
    } else if (entryLanguage(entry, vocabLanguageById) !== language) continue;
    if (entry.kind === 'audio') audio.push(entry);
    else images.push(entry);
  }
  const byAsset = (a, b) => (a.asset ?? '').localeCompare(b.asset ?? '');
  const byId = (a, b) => a.id.localeCompare(b.id);
  audio.sort(byAsset);
  images.sort(byId);
  return { audio, images };
}

/* ---------- ZIP (STORE, deterministisch) ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixe DOS-Zeit 1980-01-01 00:00 — Voraussetzung fuer reproduzierbare Zips.
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

/** Schreibt ein ZIP ohne Kompression. Eintraege werden nach Name sortiert. */
function writeZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of sorted) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method: STORE
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralDirectory, eocd]);
}

/** Listet die Dateinamen eines Zips (fuer Tests und Gegenprobe). */
function readZipNames(buffer) {
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65536; i--) {
    if (buffer[i] === eocdSig[0] && buffer[i + 1] === eocdSig[1] && buffer[i + 2] === eocdSig[2] && buffer[i + 3] === eocdSig[3]) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw Error('Kein ZIP-Ende gefunden.');
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw Error('Beschaedigtes zentrales Verzeichnis.');
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    names.push(buffer.toString('utf8', pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/* ---------- Bilder: PNG -> WebP (512 px) ---------- */

let webpEncoderAvailable;
function hasWebpEncoder() {
  if (webpEncoderAvailable === undefined) {
    const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }).toString();
    webpEncoderAvailable = /\blibwebp\b/.test(encoders);
  }
  return webpEncoderAvailable;
}

/**
 * Skaliert auf maximal 512 px Kante. `format` entscheidet den Encoder und
 * muss zur Endung des Zielpfads passen (ffmpeg waehlt den Muxer daran).
 * Das Komma im scale-Ausdruck muss gequotet in EINEM argv ankommen —
 * der Filtergraph-Parser von ffmpeg verarbeitet die Hochkommata selbst
 * (keine Shell beteiligt).
 */
function transcodeImage(inputFile, outputFile, format) {
  const encoder = format === 'webp' ? ['-c:v', 'libwebp', '-quality', String(IMAGE_QUALITY)] : [];
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-y', '-nostdin',
    '-protocol_whitelist', 'file,pipe', '-i', inputFile,
    '-vf', `scale='min(${IMAGE_MAX_EDGE},iw)':-2`,
    ...encoder, outputFile],
  { windowsHide: true, timeout: 120000 });
}

/* ---------- Paketbau ---------- */

function assetNameOfAudio(entry) {
  const name = entry.asset ?? entry.document?.blobKey;
  if (!name || !/^[a-f0-9]{64}\.(mp3|wav|m4a)$/.test(name)) {
    throw Error(`Unerwarteter Asset-Name bei Audio ${entry.id}: ${JSON.stringify(name)}`);
  }
  return name;
}

function imageNameOf(entry, format) {
  if (!/^[a-z0-9_-]+$/i.test(entry.id)) throw Error(`Unerwartete Bild-ID: ${entry.id}`);
  return `${entry.id}.${format}`;
}

function zipEntryName(kind, name) {
  // ZIP-Pfade immer mit "/" (APFS- und Windows-Entpacker sind hier pingelig).
  return `${kind}/${name}`;
}

async function buildPack(repoRoot, options = {}) {
  const lang = options.lang ?? options.language;
  if (!/^[a-z]{2}$/.test(lang ?? '')) throw Error('--lang (zwei Buchstaben) ist erforderlich.');
  const root = path.resolve(repoRoot);
  const outRoot = path.resolve(root, options.out ?? 'dist/packs');
  const now = options.now ?? new Date().toISOString();

  const catalogPath = path.join(root, 'src/content/catalog.json');
  const catalogBytes = await fs.readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const sourceCatalogSha256 = sha256(catalogBytes);

  const isDeliverable = options.isDeliverable
    ?? domain.load('src/lib/content/audio-policy').isDeliverableEntry;
  const vocabLanguageById = options.vocabLanguageById
    ?? (() => {
      // Der Wortschatz steht im Katalog selbst (kein fester Grundstock mehr).
      return new Map(catalog.entries
        .filter((entry) => entry.kind === 'vocabulary')
        .map((entry) => [entry.document.id, entry.document.language]));
    })();

  const { audio, images } = selectPackEntries(catalog, lang, vocabLanguageById, isDeliverable);
  if (!audio.length && !images.length) {
    throw Error(`Keine auslieferbaren Eintraege fuer Sprache "${lang}" im Katalog.`);
  }

  const assetsDir = path.join(root, 'assets/content');
  const files = []; // { path, sha256, bytes } fuer das Manifest
  const zipEntries = []; // { name, data } fuer das Zip

  for (const entry of audio) {
    const name = assetNameOfAudio(entry);
    const data = await fs.readFile(path.join(assetsDir, name));
    if (data.length !== (entry.byteSize ?? data.length)) {
      throw Error(`Bytezahl weicht ab bei ${entry.id} (${name}).`);
    }
    const zipName = zipEntryName('audio', name);
    zipEntries.push({ name: zipName, data });
    files.push({ path: zipName, sha256: sha256(data), bytes: data.length });
  }

  const tmpDir = path.join(outRoot, `.tmp-${lang}-${process.pid}`);
  await fs.mkdir(tmpDir, { recursive: true });
  try {
    for (const entry of images) {
      const source = path.join(assetsDir, entry.asset ?? entry.document?.blobKey);
      if (!fss.existsSync(source)) throw Error(`Bild-Asset fehlt: ${entry.asset}`);
      const format = hasWebpEncoder() ? 'webp' : 'png';
      if (format !== 'webp') {
        console.warn(`[build-pack] ffmpeg ohne libwebp — Bild ${entry.id} wird als skaliertes PNG ausgeliefert.`);
      }
      // Der Loader im App-Code lost Bild-IDs ueber den Datei-Index des
      // Manifests auf (Praefix images/<id>.), nicht ueber eine fixe Endung —
      // deshalb ist der Format-Fallback hier gefahrlos.
      const finalTarget = path.join(tmpDir, imageNameOf(entry, format));
      await transcodeImage(source, finalTarget, format);
      const data = await fs.readFile(finalTarget);
      const zipName = zipEntryName('images', imageNameOf(entry, format));
      zipEntries.push({ name: zipName, data });
      files.push({ path: zipName, sha256: sha256(data), bytes: data.length });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Version: uebersteuert per Option, sonst hoechste gebaute + 1.
  const langDir = path.join(outRoot, lang);
  const existingIndex = await readIndex(langDir);
  const version = options.version
    ?? (existingIndex.latest ? existingIndex.latest + 1 : 1);
  if (!Number.isInteger(version) || version < 1) throw Error(`Ungueltige Version: ${version}`);

  const manifest = {
    schemaVersion: PACK_SCHEMA_VERSION,
    language: lang,
    version,
    createdAt: now,
    sourceCatalogSha256,
    files,
    totals: {
      audio: audio.length,
      images: images.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    },
  };

  zipEntries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });
  const zip = writeZip(zipEntries);

  await fs.mkdir(langDir, { recursive: true });
  const zipName = `thai-pack-${lang}-v${version}.zip`;
  await fs.writeFile(path.join(langDir, zipName), zip);
  // Sidecar fuer den Downloader: gleiches Manifest plus Zip-Pruefwerte,
  // damit das Geraet VOR dem Entpacken Groesse und (spaeter mit expo-crypto)
  // die Pruefsumme des Archivs gegenchecken kann.
  await fs.writeFile(path.join(langDir, `thai-pack-${lang}-v${version}.manifest.json`), JSON.stringify({
    ...manifest,
    zipBytes: zip.length,
    zipSha256: sha256(zip),
  }, null, 2));
  const index = await writeIndex(langDir, lang, version);

  return {
    language: lang,
    version,
    zipPath: path.join(langDir, zipName),
    zipBytes: zip.length,
    zipSha256: sha256(zip),
    manifest,
    index,
  };
}

async function readIndex(langDir) {
  try {
    const raw = await fs.readFile(path.join(langDir, 'index.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.versions) && typeof parsed.latest === 'number') return parsed;
  } catch {
    // Noch kein Index vorhanden.
  }
  return { language: null, versions: [], latest: 0 };
}

async function writeIndex(langDir, lang, version) {
  const previous = await readIndex(langDir);
  const versions = [...new Set([...previous.versions, version])].sort((a, b) => a - b);
  const index = { language: lang, versions, latest: Math.max(version, previous.latest ?? 0) };
  await fs.writeFile(path.join(langDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

module.exports = {
  PACK_SCHEMA_VERSION,
  IMAGE_MAX_EDGE,
  selectPackEntries,
  entryLanguage,
  conceptLanguagesOf,
  buildPack,
  writeZip,
  readZipNames,
  crc32,
  transcodeImage,
  hasWebpEncoder,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = path.resolve(__dirname, '../..');
  const requested = option('--lang');
  // `--lang all`: alle Lernsprachen nacheinander (dieselbe Liste wie die App).
  const langs = requested === 'all' ? domain.load('src/lib/languages/types').LANGUAGE_CODES : [requested];
  (async () => {
    for (const lang of langs) {
      const result = await buildPack(root, {
        lang,
        out: option('--out'),
        version: option('--version') ? Number(option('--version')) : undefined,
      });
      const { manifest } = result;
      console.log(`Paket gebaut: ${result.zipPath}`);
      console.log(`  Sprache ${manifest.language}, Version ${manifest.version}`);
      console.log(`  Audio: ${manifest.totals.audio}, Bilder: ${manifest.totals.images}`);
      console.log(`  Inhalt: ${(manifest.totals.bytes / 1024 / 1024).toFixed(1)} MB, Zip: ${(result.zipBytes / 1024 / 1024).toFixed(1)} MB`);
      console.log(`  Zip-Sha256: ${result.zipSha256}`);
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
