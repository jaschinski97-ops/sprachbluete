/**
 * Download und Installation eines Sprachpakets.
 *
 * Ablauf (jeder Schritt kann abbrechen; dann bleibt der bisherige Zustand
 * unangetastet und der Zwischenstand wird weggeraeumt):
 *
 *   1. Zielversion bestimmen (Override: index.json, GitHub: Releases-API).
 *   2. Manifest (Sidecar) laden und strikt validieren.
 *   3. Zip in den App-Cache laden, Fortschritt melden; Byte-Check gegen
 *      `zipBytes` aus dem Manifest — ein abgeschnittener Download wird nie
 *      entpackt.
 *   4. Entpacken ueber den injizierten PackExtractor.
 *   5. Gegenprobe: Dateianzahl und Gesamtbytes gegen `totals`.
 *   6. Aktivieren, Cache-Zip loeschen, alte Versionen wegraeumen.
 *
 * sha256-Einzelpruefung der entpackten Dateien auf dem Geraet ist bewusst
 * noch nicht drin (dafuer braucht es expo-crypto als Abhaengigkeit — siehe
 * Report); das Manifest traegt die Pruefsummen bereits fuer diesen Schritt.
 */

import { Directory, File, type DownloadTask } from 'expo-file-system';

import type { PackLanguage, PackReleaseInfo } from './manifest';
import { validatePackManifest } from './manifest';
import {
  githubReleasesApiUrl,
  loadPackConfig,
  packIndexUrl,
  packManifestUrl,
  packZipName,
  packZipUrl,
  type PackConfig,
} from './config';
import { createPackExtractor, type PackExtractor } from './extractor';
import {
  activatePack,
  deactivatePack,
  installedVersions,
  installedPackUri,
  packsRootUri,
  pruneOldVersions,
  removePack,
} from './store';
import { invalidatePackCache } from './loader';

export type PackDownloadStage = 'version' | 'manifest' | 'download' | 'verify' | 'extract' | 'activate' | 'cleanup';

export type PackDownloadProgress = {
  stage: PackDownloadStage;
  language: PackLanguage;
  version: number;
  bytesWritten?: number;
  totalBytes?: number;
};

export type InstallPackOptions = {
  /** Gewuenschte Version; ohne wird die neueste verfuegbare genommen. */
  version?: number;
  onProgress?: (progress: PackDownloadProgress) => void;
  signal?: AbortSignal;
  /** Abhaengigkeiten — nur fuer Tests (sonst: echtes fetch, nativer Extraktor). */
  deps?: {
    fetch?: typeof fetch;
    extractor?: PackExtractor | null;
    config?: PackConfig;
  };
};

export class PackInstallError extends Error {
  constructor(message: string, readonly stage: PackDownloadStage) {
    super(message);
  }
}

/** Reine Versionswahl — getestet ohne Netz. */
export function choosePackVersion(installed: number[], available: number[], preferred?: number): number | null {
  if (available.length === 0) return null;
  if (preferred !== undefined) {
    return available.includes(preferred) ? preferred : null;
  }
  return Math.max(...available);
}

type FetchLike = typeof fetch;

/** JSON.parse mit sauberem PackInstallError statt rohem SyntaxError (Review P2-4). */
function parseJsonOrThrow(raw: string, stage: 'version' | 'manifest'): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new PackInstallError(`Ungueltiges JSON (${stage}): ${(error as Error).message}`, stage);
  }
}

async function fetchText(url: string, fetchImpl: FetchLike, signal?: AbortSignal): Promise<string> {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new PackInstallError(`HTTP ${response.status} bei ${url}`, 'manifest');
  return response.text();
}

type IndexJson = { versions?: unknown; latest?: unknown };

async function fetchAvailableVersions(
  config: PackConfig,
  language: PackLanguage,
  fetchImpl: FetchLike,
  signal?: AbortSignal
): Promise<number[]> {
  const indexUrl = packIndexUrl(config, language);
  if (indexUrl) {
    const raw = await fetchText(indexUrl, fetchImpl, signal);
    const index = parseJsonOrThrow(raw, 'version') as IndexJson;
    const versions = Array.isArray(index.versions) ? index.versions.filter((v): v is number => Number.isInteger(v) && v >= 1) : [];
    return versions.sort((a, b) => a - b);
  }
  // GitHub: Releases-Liste, Tags nach pack-<lang>-v<N> filtern.
  const raw = await fetchText(githubReleasesApiUrl(config.repo), fetchImpl, signal);
  const releases = parseJsonOrThrow(raw, 'version') as { tag_name?: unknown }[];
  const pattern = new RegExp(`^pack-${language}-v(\\d+)$`);
  const versions = releases
    .map((release) => (typeof release.tag_name === 'string' ? pattern.exec(release.tag_name) : null))
    .map((match) => (match ? Number(match[1]) : null))
    .filter((version): version is number => version !== null);
  return versions.sort((a, b) => a - b);
}

async function fetchReleaseInfo(
  config: PackConfig,
  language: PackLanguage,
  version: number,
  fetchImpl: FetchLike,
  signal?: AbortSignal
): Promise<PackReleaseInfo> {
  const raw = await fetchText(packManifestUrl(config, language, version), fetchImpl, signal);
  const manifest = validatePackManifest(parseJsonOrThrow(raw, 'manifest'), { language, version }) as PackReleaseInfo;
  if (typeof manifest.zipBytes !== 'number' || manifest.zipBytes <= 0) {
    throw new PackInstallError('Manifest ohne gueltiges zipBytes — Byte-Check unmoeglich.', 'manifest');
  }
  return manifest;
}

/** Neueste veröffentlichte Version samt Zip-Größe — für „Laden · 98 MB“. */
export type LatestPackRelease = { version: number; zipBytes: number };

/**
 * Fragt die neueste veröffentlichte Paketversion ab (Releases-Liste plus
 * Manifest, beides klein). `null`, wenn es für die Sprache noch kein Release
 * gibt; Netzfehler werfen.
 */
export async function latestPackRelease(
  language: PackLanguage,
  deps: { fetch?: FetchLike; config?: PackConfig; signal?: AbortSignal } = {}
): Promise<LatestPackRelease | null> {
  const fetchImpl = deps.fetch ?? fetch;
  const config = deps.config ?? loadPackConfig();
  const available = await fetchAvailableVersions(config, language, fetchImpl, deps.signal);
  const version = choosePackVersion([], available);
  if (version === null) return null;
  const release = await fetchReleaseInfo(config, language, version, fetchImpl, deps.signal);
  return { version, zipBytes: release.zipBytes };
}

function isFileAvailable(): boolean {
  return packsRootUri() !== null;
}

/**
 * Installiert (oder aktualisiert) das Sprachpaket und macht es aktiv.
 * Liefert URI und Version des aktiven Pakets.
 */
export async function installLanguagePack(
  language: PackLanguage,
  options: InstallPackOptions = {}
): Promise<InstalledPackResult> {
  const { version: preferred, onProgress, signal, deps } = options;
  const fetchImpl = deps?.fetch ?? fetch;
  const config = deps?.config ?? loadPackConfig();
  const report = (stage: PackDownloadStage, extra: Partial<PackDownloadProgress> = {}) =>
    onProgress?.({ stage, language, version: -1, ...extra });

  if (!isFileAvailable()) {
    throw new PackInstallError('Dateisystem nicht verfuegbar (Web ohne Paket-Support?).', 'download');
  }

  report('version');
  const available = await fetchAvailableVersions(config, language, fetchImpl, signal);
  const version = choosePackVersion(await installedVersions(language), available, preferred);
  if (version === null) {
    throw new PackInstallError(
      preferred !== undefined
        ? `Version ${preferred} ist nicht verfuegbar (verfuegbar: ${available.join(', ') || 'keine'}).`
        : 'Kein Paket-Release gefunden.',
      'version'
    );
  }

  const release = await fetchReleaseInfo(config, language, version, fetchImpl, signal);
  report('manifest', { version });

  const root = packsRootUri() as string;
  const destUri = installedPackUri(language, version) as string;
  const cacheZipUri = `${root}/${packZipName(language, version)}`;

  try {
    // 3. Zip laden (App-Cache), Fortschritt, Byte-Check.
    report('download', { version, bytesWritten: 0, totalBytes: release.zipBytes });
    // Paketordner zuerst anlegen (28.10.2026): Beim ersten Download gab es
    // `Dokumente/packs` noch nicht, iOS lehnte das Schreiben der Zip ab, und
    // kein Paket liess sich laden. Angelegt wurde der Ordner erst beim Aktivieren.
    const rootDir = new Directory(root);
    if (!rootDir.exists) rootDir.create({ intermediates: true, idempotent: true });
    const zipFile = new File(cacheZipUri);
    if (zipFile.exists) zipFile.delete();
    const task: DownloadTask = File.createDownloadTask(packZipUrl(config, language, version), zipFile, {
      onProgress: ({ bytesWritten, totalBytes }) =>
        onProgress?.({ stage: 'download', language, version, bytesWritten, totalBytes }),
      signal,
    });
    await task.downloadAsync();
    if (!zipFile.exists || zipFile.size !== release.zipBytes) {
      throw new PackInstallError(
        `Zip-Byte-Check fehlgeschlagen: ${zipFile.exists ? zipFile.size : 'fehlt'} statt ${release.zipBytes} Byte.`,
        'verify'
      );
    }

    // 4. Entpacken.
    report('extract', { version });
    const extractor = deps?.extractor !== undefined ? deps.extractor : createPackExtractor();
    if (!extractor) {
      throw new PackInstallError(
        'Kein Entpacker verfuegbar — react-native-zip-archive ist nicht installiert.',
        'extract'
      );
    }
    await deleteDirectoryIfExists(destUri);
    try {
      await extractor.extract(zipFile.uri, destUri);
    } catch (error) {
      // Halb entpacktes Paket nie zuruecklassen — sonst glaubt installedVersions,
      // eine brauchbare Version zu sehen.
      await deleteDirectoryIfExists(destUri);
      throw error;
    }

    // 5. Gegenprobe gegen das Manifest (Dateianzahl + Bytes).
    report('verify', { version });
    await verifyExtractedPack(language, version, release);
  } finally {
    // 6. Cache-Zip weg, egal wie es ausgegangen ist.
    report('cleanup', { version });
    try {
      const zipFile = new File(cacheZipUri);
      if (zipFile.exists) zipFile.delete();
    } catch {
      // Cache-Datei verschenkt nicht ihre Aufmerksamkeit.
    }
  }

  // 6b. Aktivieren, Loader-Cache verwerfen, alte Versionen wegraeumen.
  report('activate', { version });
  await activatePack(language, version);
  invalidatePackCache(language);
  await pruneOldVersions(language, version).catch(() => []);

  return { language, version, uri: destUri, manifest: release };
}

export type InstalledPackResult = {
  language: PackLanguage;
  version: number;
  uri: string;
  manifest: PackReleaseInfo;
};

async function deleteDirectoryIfExists(uri: string): Promise<void> {
  try {
    const directory = new Directory(uri);
    if (directory.exists) directory.delete();
  } catch {
    // Nie angelegt — gut.
  }
}

/**
 * Prueft das entpackte Paket gegen das Manifest: jede Datei da und
 * dateigenau gross, Summen stimmen. sha256 je Datei folgt mit
 * expo-crypto (TODO, siehe Kopf).
 */
async function verifyExtractedPack(
  language: PackLanguage,
  version: number,
  release: PackReleaseInfo
): Promise<void> {
  const destUri = installedPackUri(language, version) as string;
  let bytes = 0;
  for (const file of release.files) {
    const extracted = new File(`${destUri}/${file.path}`);
    if (!extracted.exists) {
      throw new PackInstallError(`Entpacktes Paket unvollstaendig: ${file.path} fehlt.`, 'verify');
    }
    if (extracted.size !== file.bytes) {
      throw new PackInstallError(
        `Dateigroesse weicht ab bei ${file.path}: ${extracted.size} statt ${file.bytes}.`,
        'verify'
      );
    }
    bytes += extracted.size;
  }
  if (bytes !== release.totals.bytes) {
    throw new PackInstallError(
      `Gesamtgroesse weicht ab: ${bytes} statt ${release.totals.bytes}.`,
      'verify'
    );
  }
}

/** Deaktiviert und entfernt alle Pakete einer Sprache (Einstellungen/Debug). */
export async function uninstallLanguagePack(language: PackLanguage): Promise<void> {
  await deactivatePack(language);
  invalidatePackCache(language);
  for (const version of await installedVersions(language)) {
    await removePack(language, version);
  }
}
