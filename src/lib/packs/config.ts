/**
 * Woher die Sprachpakete kommen.
 *
 * Zentrale URL-Bauweise — Entscheidungen:
 *
 *   1. Produktiv: GitHub Releases des konfigurierten Repos. Ein Release je
 *      Sprache+Version, Tag `pack-<lang>-v<N>`, Asset `thai-pack-<lang>-v<N>.zip`
 *      plus Sidecar `thai-pack-<lang>-v<N>.manifest.json` (gleiche Datei wie im
 *      Zip, plus zipBytes/zipSha256 fuer den Byte-Check vor dem Entpacken).
 *   2. Entwicklung: `extra.pack.baseUrlOverride` in app.json, z. B. ein
 *      statischer Server auf `dist/packs` (docs/PIPELINE.md, Abschnitt 5) —
 *      dort entscheidet `<base>/<lang>/index.json` ueber die neueste Version.
 *
 * Die Konfiguration kommt aus `app.json` unter `expo.extra.pack` (expo-constants).
 * Ohne Konfiguration gilt der Platzhalter `OWNER/REPO`: Downloads scheitern dann
 * kontrolliert statt an der falschen Stelle zu landen.
 */

import type { PackLanguage } from './manifest';

export type PackConfig = {
  /** `OWNER/REPO` des GitHub-Repos, das die Paket-Releases haelt. */
  repo: string;
  /** `http://localhost:8082/packs` o.ae. — nur Entwicklung, null im Release. */
  baseUrlOverride: string | null;
};

/** Platzhalter, bis der Orchestrator das echte Paket-Repo eintraegt. */
export const DEFAULT_PACK_REPO = 'OWNER/REPO';

export const DEFAULT_PACK_CONFIG: PackConfig = {
  repo: DEFAULT_PACK_REPO,
  baseUrlOverride: null,
};

type ExtraPack = {
  pack?: { repo?: unknown; baseUrlOverride?: unknown };
};

/** Liest `expo.extra.pack`; `source` nur fuer Tests. */
export function loadPackConfig(source?: unknown): PackConfig {
  let extra: ExtraPack | undefined;
  if (source !== undefined) {
    extra = source as ExtraPack;
  } else {
    try {
      // Lazy-Require statt statischem Import: expo-constants ist im
      // Node-Testprozess unnuetz, und das Pack-Modul muss dort importierbar
      // bleiben (Loader degradiert dann auf eingebettete Assets).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Constants = require('expo-constants') as { expoConfig?: { extra?: ExtraPack } };
      extra = Constants.expoConfig?.extra;
    } catch {
      return DEFAULT_PACK_CONFIG;
    }
  }
  const pack = extra?.pack;
  if (!pack || typeof pack !== 'object') return DEFAULT_PACK_CONFIG;
  const repo = typeof pack.repo === 'string' && pack.repo.includes('/') ? pack.repo : DEFAULT_PACK_REPO;
  const baseUrlOverride =
    typeof pack.baseUrlOverride === 'string' && pack.baseUrlOverride.length > 0 ? pack.baseUrlOverride : null;
  return { repo, baseUrlOverride };
}

/** GitHub-Release-Tag eines Pakets. */
export function releaseTagFor(language: PackLanguage, version: number): string {
  return `pack-${language}-v${version}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function packZipName(language: PackLanguage, version: number): string {
  return `thai-pack-${language}-v${version}.zip`;
}

/** Manifest als Sidecar neben dem Zip (mit zipBytes/zipSha256). */
export function packManifestName(language: PackLanguage, version: number): string {
  return `thai-pack-${language}-v${version}.manifest.json`;
}

export function packZipUrl(config: PackConfig, language: PackLanguage, version: number): string {
  if (config.baseUrlOverride) {
    return `${stripTrailingSlash(config.baseUrlOverride)}/${language}/${packZipName(language, version)}`;
  }
  return `https://github.com/${config.repo}/releases/download/${releaseTagFor(language, version)}/${packZipName(language, version)}`;
}

export function packManifestUrl(config: PackConfig, language: PackLanguage, version: number): string {
  if (config.baseUrlOverride) {
    return `${stripTrailingSlash(config.baseUrlOverride)}/${language}/${packManifestName(language, version)}`;
  }
  return `https://github.com/${config.repo}/releases/download/${releaseTagFor(language, version)}/${packManifestName(language, version)}`;
}

/** index.json des lokalen Helpers (nur mit baseUrlOverride sinnvoll). */
export function packIndexUrl(config: PackConfig, language: PackLanguage): string | null {
  if (!config.baseUrlOverride) return null;
  return `${stripTrailingSlash(config.baseUrlOverride)}/${language}/index.json`;
}

/** GitHub-API: Release-Liste fuer die Versionssuche (nur ohne Override). */
export function githubReleasesApiUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases?per_page=100`;
}
