const { createHash } = require('node:crypto');
const fs = require('node:fs');

// SCHLANKER APP-KATALOG (18.10.2026): `src/content/catalog.json` trägt neben
// dem Inhalt alles, was Studio, Pipeline und `content:integrity` brauchen
// (Tonmessung, Digests, Bytezahlen, Anbieter, Modell, Stimme, Prompts …).
// Die App liest davon nur einen kleinen Teil, bekam aber bisher alles ins
// JS-Bundle. Für jeden NICHT-Entwicklungsbau (`expo export`, EAS, Gradle-
// Release) ersetzt der Metro-Transformer die Datei deshalb durch diese
// Fassung. Der Entwicklungsbau (Studio auf 8081) behält den vollen Katalog,
// die Datei selbst bleibt unverändert.
//
// Was die App liest (geprüft per grep über src/, ohne src/dev):
// - Eintrag: kind, id, document, asset; aus check nur status und tone.status
//   (`isDeliverableEntry` in audio-policy.ts, Thai-Gate in `resolveClipUri`).
// - Wortschatz und Situationen: das ganze Dokument — das IST der Inhalt.
// - Hörclips: document.id und document.language (`isDeliverableEntry`
//   unterscheidet Thai). Text, blobKey, Anbieter, Stimme … liest nur das Studio.
// - Bilder: document.id und document.vocabId.
// - Katalog: version, vocabularySource, deleted, clearedBefore (`isDeletedDraft`).
// Unbekannte Inhaltsarten und Katalogfelder bleiben vollständig erhalten.
// `app-catalog.test.ts` vergleicht App-Sicht von vollem und schlankem Katalog.

const DOCUMENT_FIELDS = {
  audio: ['id', 'language'],
  images: ['id', 'vocabId'],
};

function pick(source, fields) {
  const result = {};
  for (const field of fields) if (source[field] !== undefined) result[field] = source[field];
  return result;
}

function slimCheck(check) {
  if (!check) return undefined;
  const result = { status: check.status };
  if (check.tone) result.tone = { status: check.tone.status };
  return result;
}

function slimEntry(entry) {
  const fields = DOCUMENT_FIELDS[entry.kind];
  const result = { kind: entry.kind, id: entry.id, document: fields ? pick(entry.document, fields) : entry.document };
  if (entry.asset !== undefined) result.asset = entry.asset;
  const check = slimCheck(entry.check);
  if (check) result.check = check;
  return result;
}

function slimCatalog(catalog) {
  return { ...catalog, entries: catalog.entries.map(slimEntry) };
}

function isAppCatalogFile(filename) {
  return /(^|[\\/])src[\\/]content[\\/]catalog\.json$/.test(filename);
}

/** Hüllt den Expo-Transformer ein; nur der Katalog im Nicht-Entwicklungsbau ändert sich. */
function wrapTransform(transform) {
  return (config, projectRoot, filename, data, options) => {
    if (options?.dev === false && isAppCatalogFile(filename)) {
      data = Buffer.from(JSON.stringify(slimCatalog(JSON.parse(data.toString('utf8')))));
    }
    return transform(config, projectRoot, filename, data, options);
  };
}

// Expo nimmt eigene Transformer nicht in den Cache-Schlüssel auf
// (supervising-transform-worker). metro.config.js setzt das als
// `cacheVersion`, damit ein Festplatten-Cache nach Änderungen hier neu baut.
const CACHE_KEY = 'app-catalog-' + createHash('sha1').update(fs.readFileSync(__filename)).digest('hex').slice(0, 12);

module.exports = { CACHE_KEY, isAppCatalogFile, slimCatalog, wrapTransform };
