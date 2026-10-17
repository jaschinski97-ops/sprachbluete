/**
 * Typen und Validierung fuer Paket-Manifeste.
 *
 * Ein Sprachpaket ist ein Zip mit `manifest.json`, `audio/*.mp3` und
 * `images/*.webp`. Das Manifest listet jede Datei mit Pruefsumme und
 * Groesse; der Katalog (weiterhin eingebettet) bleibt die inhaltliche
 * Quelle — das Paket transportiert nur Bytes.
 *
 * Validierung bewusst unguenstig gegen Fremd-JSON: Ein Paket aus einer
 * fremden Quelle darf beim Installieren hart scheitern, nicht halb laden.
 */

import { LANGUAGE_CODES, type LanguageCode } from '../languages/types';

export const PACK_SCHEMA_VERSION = 1 as const;

/** Je Lernsprache gibt es ein Paket. */
export type PackLanguage = LanguageCode;

export const PACK_LANGUAGES: readonly PackLanguage[] = LANGUAGE_CODES;

export function isPackLanguage(value: unknown): value is PackLanguage {
  return typeof value === 'string' && (PACK_LANGUAGES as readonly string[]).includes(value);
}

/** Eine Datei im Paket, Pfad relativ zum Paketwurzelverzeichnis ("/"-getrennt). */
export type PackManifestFile = {
  path: string;
  sha256: string;
  bytes: number;
};

export type PackManifest = {
  schemaVersion: typeof PACK_SCHEMA_VERSION;
  language: PackLanguage;
  version: number;
  createdAt: string;
  /** sha256 von `src/content/catalog.json` zum Bauzeitpunkt. */
  sourceCatalogSha256: string;
  files: PackManifestFile[];
  totals: {
    audio: number;
    images: number;
    bytes: number;
  };
};

/**
 * Manifest wie es der Downloader laedt: das Paket-Manifest plus
 * Pruefwerte des Archivs selbst (Sidecar `*.manifest.json` neben dem Zip).
 * `zipBytes` ist verpflichtend fuer den Byte-Check vor dem Entpacken.
 */
export type PackReleaseInfo = PackManifest & {
  zipBytes: number;
  zipSha256?: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strikte Pruefung ohne Vertrauen in die Quelle. Gibt das Fehlerproblem oder null zurueck. */
export function manifestProblem(value: unknown): string | null {
  if (!isPlainObject(value)) return 'Manifest ist kein Objekt.';
  if (value.schemaVersion !== PACK_SCHEMA_VERSION) {
    return `Nicht unterstuetzte schemaVersion: ${JSON.stringify(value.schemaVersion)}`;
  }
  if (!isPackLanguage(value.language)) return `Unbekannte Sprache: ${JSON.stringify(value.language)}`;
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    return `Ungueltige Version: ${JSON.stringify(value.version)}`;
  }
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return 'createdAt ist kein ISO-Datum.';
  }
  if (typeof value.sourceCatalogSha256 !== 'string' || !SHA256_PATTERN.test(value.sourceCatalogSha256)) {
    return 'sourceCatalogSha256 fehlt oder ist kein sha256-Hexwert.';
  }
  if (!Array.isArray(value.files) || value.files.length === 0) return 'files fehlt oder ist leer.';
  let bytes = 0;
  let lastPath = '';
  for (const file of value.files) {
    if (!isPlainObject(file)) return 'Eintrag in files ist kein Objekt.';
    if (typeof file.path !== 'string' || !/^[a-z0-9_\-./]+$/i.test(file.path) || file.path.includes('..')) {
      return `Unzulaessiger Dateipfad: ${JSON.stringify(file.path)}`;
    }
    if (file.path <= lastPath) return `files ist nicht aufsteigend sortiert bei ${file.path}`;
    lastPath = file.path;
    if (typeof file.sha256 !== 'string' || !SHA256_PATTERN.test(file.sha256)) {
      return `Ungueltige sha256 bei ${file.path}`;
    }
    if (!Number.isInteger(file.bytes) || (file.bytes as number) < 0) {
      return `Ungueltige Bytezahl bei ${file.path}`;
    }
    bytes += file.bytes as number;
  }
  if (!isPlainObject(value.totals)) return 'totals fehlt.';
  const totals = value.totals as Record<string, unknown>;
  for (const key of ['audio', 'images', 'bytes'] as const) {
    if (!Number.isInteger(totals[key]) || (totals[key] as number) < 0) {
      return `totals.${key} fehlt oder ist ungueltig.`;
    }
  }
  if (totals.bytes !== bytes) return `totals.bytes (${totals.bytes}) passt nicht zur Summe der Dateien (${bytes}).`;
  return null;
}

/**
 * Wirft mit verstaendlicher Meldung, wenn das Manifest unbrauchbar ist.
 * `expected` prueft zusaetzlich, ob das gelieferte Paket das angefragte ist.
 */
export function validatePackManifest(
  value: unknown,
  expected?: { language?: PackLanguage; version?: number }
): PackManifest {
  const problem = manifestProblem(value);
  if (problem) throw Error(`Paket-Manifest unbrauchbar: ${problem}`);
  const manifest = value as PackManifest;
  if (expected?.language && manifest.language !== expected.language) {
    throw Error(`Paket ist fuer "${manifest.language}", angefragt war "${expected.language}".`);
  }
  if (expected?.version !== undefined && manifest.version !== expected.version) {
    throw Error(`Paket ist Version ${manifest.version}, angefragt war ${expected.version}.`);
  }
  return manifest;
}
