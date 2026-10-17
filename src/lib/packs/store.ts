/**
 * Installationsort und Lebenszyklus installierter Sprachpakete.
 *
 * Speicherort (expo-file-system, SDK-57-API mit File/Directory/Paths —
 * die Funktions-API liegt in v57 hinter `expo-file-system/legacy` und
 * wird hier bewusst NICHT benutzt):
 *
 *   <documentDirectory>/packs/<lang>/v<N>/        entpacktes Paket
 *   <documentDirectory>/packs/<lang>/active.json  gewaehlte Version
 *
 * `active.json` liegt im packs-Baum statt im Dokumentspeicher: Die
 * Paketverwaltung bleibt ein abgeschlossener Bereich, den man per
 * Verzeichnis loeschen kann, ohne Lernzustand anzufassen.
 *
 * Alle Zugriffe failen kontrolliert (null/leer), wenn das Dateisystem
 * nicht verfuegbar ist — der Loader faellt dann auf eingebettete Assets
 * zurueck, ohne dass ein Aufrufer davon erfaehrt werden muss.
 */

import type { PackLanguage, PackManifest } from './manifest';
import { validatePackManifest } from './manifest';

type FileSystemModule = typeof import('expo-file-system');

let fileSystemModule: FileSystemModule | null | undefined;

/** Lazy + fail-silent: im Node-Test/Web ohne natives Modul gibt es null. */
export function fileSystem(): FileSystemModule | null {
  if (fileSystemModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fileSystemModule = require('expo-file-system') as FileSystemModule;
    } catch {
      fileSystemModule = null;
    }
  }
  return fileSystemModule;
}

export type InstalledPack = {
  language: PackLanguage;
  version: number;
  /** file://-URI des entpackten Paketverzeichnisses. */
  uri: string;
};

type ActiveMarker = {
  language: PackLanguage;
  version: number;
  activatedAt: string;
};

export function activeMarkerName(): string {
  return 'active.json';
}

/** Ordnername einer Paketversion: `v<N>`. */
export function versionDirName(version: number): string {
  return `v${version}`;
}

/** `v3` -> 3; alles andere (auch `v0`) -> null. */
export function versionFromDirName(name: string): number | null {
  if (!/^v(\d+)$/.test(name)) return null;
  const version = Number(name.slice(1));
  return version >= 1 ? version : null;
}

/** Document-Verzeichnis als URI, oder null ohne Dateisystem. */
function documentUri(): string | null {
  const fs = fileSystem();
  try {
    return fs?.Paths.document.uri ?? null;
  } catch {
    return null;
  }
}

/** Wurzel aller Pakete: `<document>/packs`. */
export function packsRootUri(): string | null {
  const base = documentUri();
  return base ? `${base.replace(/\/$/, '')}/packs` : null;
}

/** Installationsort einer konkreten Paketversion. */
export function installedPackUri(language: PackLanguage, version: number): string | null {
  const root = packsRootUri();
  return root ? `${root}/${language}/${versionDirName(version)}` : null;
}

async function ensureDirectory(uri: string): Promise<void> {
  const fs = fileSystem();
  const dir = new (fs as FileSystemModule).Directory(uri);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

async function fileExists(uri: string): Promise<boolean> {
  const fs = fileSystem();
  if (!fs) return false;
  try {
    return new fs.File(uri).exists;
  } catch {
    return false;
  }
}

async function readTextFile(uri: string): Promise<string | null> {
  const fs = fileSystem();
  if (!fs) return null;
  try {
    const file = new fs.File(uri);
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

async function writeTextFile(uri: string, contents: string): Promise<void> {
  const fs = fileSystem();
  if (!fs) throw Error('Dateisystem nicht verfuegbar.');
  const file = new fs.File(uri);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
}

async function deleteRecursively(uri: string): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    const directory = new fs.Directory(uri);
    if (directory.exists) directory.delete();
  } catch {
    // Existiert nicht oder ist ein File — beides fuer uns uninteressant.
    try {
      new fs.File(uri).delete();
    } catch {
      // Auch gut: dann war da nichts.
    }
  }
}

/**
 * Installierte Versionen einer Sprache, aufsteigend sortiert.
 * Eine Version zaehlt nur, wenn ihr manifest.json ueberlebt hat.
 */
export async function installedVersions(language: PackLanguage): Promise<number[]> {
  const fs = fileSystem();
  const root = packsRootUri();
  if (!fs || !root) return [];
  try {
    const languageDir = new fs.Directory(`${root}/${language}`);
    if (!languageDir.exists) return [];
    const versions = languageDir
      .list()
      .map((item) => versionFromDirName(item.name))
      .filter((version): version is number => version !== null);
    const usable: number[] = [];
    for (const version of versions) {
      if (await fileExists(`${installedPackUri(language, version)}/manifest.json`)) usable.push(version);
    }
    return usable.sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Gewaehlte Version einer Sprache — nur wenn sie tatsaechlich installiert ist. */
export async function activePack(language: PackLanguage): Promise<InstalledPack | null> {
  const root = packsRootUri();
  if (!root) return null;
  const raw = await readTextFile(`${root}/${language}/${activeMarkerName()}`);
  if (!raw) return null;
  try {
    const marker = JSON.parse(raw) as ActiveMarker;
    if (marker.language !== language || !Number.isInteger(marker.version) || marker.version < 1) return null;
    const uri = installedPackUri(language, marker.version);
    if (!uri || !(await fileExists(`${uri}/manifest.json`))) return null;
    return { language, version: marker.version, uri };
  } catch {
    return null;
  }
}

/**
 * Waehlt die aktive Version. Setzt voraus, dass das Paket mit gueltigem
 * Manifest installiert ist — ein kaputtes Paket wird nie aktiv.
 */
export async function activatePack(language: PackLanguage, version: number): Promise<void> {
  const fs = fileSystem();
  const root = packsRootUri();
  if (!fs || !root) throw Error('Dateisystem nicht verfuegbar — Paket kann nicht aktiviert werden.');
  const manifest = await readInstalledManifest(language, version);
  if (!manifest) throw Error(`Version ${version} von "${language}" ist nicht (gueltig) installiert.`);
  await ensureDirectory(`${root}/${language}`);
  const marker: ActiveMarker = { language, version, activatedAt: new Date().toISOString() };
  await writeTextFile(`${root}/${language}/${activeMarkerName()}`, JSON.stringify(marker, null, 2));
}

/** Nimmt die Aktivierung einer Sprache zurueck (Paket bleibt installiert). */
export async function deactivatePack(language: PackLanguage): Promise<void> {
  const root = packsRootUri();
  if (!root) return;
  const fs = fileSystem();
  try {
    const marker = new (fs as FileSystemModule).File(`${root}/${language}/${activeMarkerName()}`);
    if (marker.exists) marker.delete();
  } catch {
    // Nichts aktiv — gut so.
  }
}

/** Loescht eine installierte Version; war sie aktiv, wird die Aktivierung entfernt. */
export async function removePack(language: PackLanguage, version: number): Promise<void> {
  const uri = installedPackUri(language, version);
  if (!uri) return;
  const active = await activePack(language);
  await deleteRecursively(uri);
  if (active?.version === version) await deactivatePack(language);
}

/**
 * Raeumt alte Versionen weg. Die aktive (oder `keepVersion`) bleibt;
 * Fehler beim Loeschen alter Versionen sind kein Installationsfehler.
 */
export async function pruneOldVersions(language: PackLanguage, keepVersion: number): Promise<number[]> {
  const removed: number[] = [];
  for (const version of await installedVersions(language)) {
    if (version === keepVersion) continue;
    await removePack(language, version);
    const stillThere = await installedVersions(language);
    if (!stillThere.includes(version)) removed.push(version);
  }
  return removed;
}

/** Manifest einer installierten Version; null, wenn fehlend/ungueltig. */
export async function readInstalledManifest(
  language: PackLanguage,
  version: number
): Promise<PackManifest | null> {
  const uri = installedPackUri(language, version);
  if (!uri) return null;
  const raw = await readTextFile(`${uri}/manifest.json`);
  if (!raw) return null;
  try {
    return validatePackManifest(JSON.parse(raw), { language, version });
  } catch {
    return null;
  }
}
