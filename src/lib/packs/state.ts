/**
 * Zustand der Sprachpakete für die Oberfläche (Übersicht und Einstellungen).
 *
 * Ein Modul-Speicher statt Komponenten-State: Ein Download läuft weiter, wenn
 * man den Bildschirm wechselt, und beide Stellen zeigen denselben Fortschritt.
 * Die Netzabfrage der neuesten Version läuft je Sprache höchstens einmal pro
 * App-Start (`refreshPack`), ein Fehler dabei bleibt still — offline zeigt
 * die App einfach keinen Größenhinweis.
 */

import { useSyncExternalStore } from 'react';

import { mediaFromPacks } from '../content/bundled';
import { installLanguagePack, latestPackRelease, uninstallLanguagePack, type LatestPackRelease } from './downloader';
import type { PackLanguage } from './manifest';
import { activePack } from './store';

export type PackStatus = {
  /** Installierte, aktive Version; `null` = nicht geladen. */
  installed: number | null;
  /** Neueste veröffentlichte Version; `undefined` = noch nicht abgefragt/offline. */
  latest: LatestPackRelease | null | undefined;
  phase: 'idle' | 'downloading' | 'installing' | 'error';
  /** 0–1 während des Downloads. */
  progress: number;
};

const LEER: PackStatus = { installed: null, latest: undefined, phase: 'idle', progress: 0 };

const stand = new Map<PackLanguage, PackStatus>();
const hoerer = new Set<() => void>();
const abgefragt = new Set<PackLanguage>();

function setze(language: PackLanguage, patch: Partial<PackStatus>) {
  stand.set(language, { ...(stand.get(language) ?? LEER), ...patch });
  for (const hoererFn of hoerer) hoererFn();
}

function abonniere(fn: () => void) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

/** Muss die App Medien laden? Nur im Sprachpaket-Build, nie auf Web. */
export function packsNeeded(): boolean {
  return mediaFromPacks();
}

/** Liest den installierten Stand und fragt einmal die neueste Version ab. */
export async function refreshPack(language: PackLanguage, { force = false } = {}): Promise<void> {
  if (!packsNeeded()) return;
  const aktiv = await activePack(language).catch(() => null);
  setze(language, { installed: aktiv?.version ?? null });
  if (abgefragt.has(language) && !force) return;
  abgefragt.add(language);
  try {
    setze(language, { latest: await latestPackRelease(language) });
  } catch {
    abgefragt.delete(language);
  }
}

/** Lädt und installiert das Paket; Fortschritt und Fehler landen im Zustand. */
export async function downloadPack(language: PackLanguage): Promise<boolean> {
  const jetzt = stand.get(language) ?? LEER;
  if (jetzt.phase === 'downloading' || jetzt.phase === 'installing') return false;
  setze(language, { phase: 'downloading', progress: 0 });
  try {
    const ergebnis = await installLanguagePack(language, {
      onProgress: ({ stage, bytesWritten, totalBytes }) => {
        if (stage === 'download' && totalBytes) setze(language, { progress: Math.min(1, (bytesWritten ?? 0) / totalBytes) });
        if (stage === 'extract' || stage === 'verify' || stage === 'activate') setze(language, { phase: 'installing', progress: 1 });
      },
    });
    setze(language, { installed: ergebnis.version, phase: 'idle', progress: 0 });
    return true;
  } catch {
    setze(language, { phase: 'error', progress: 0 });
    return false;
  }
}

export async function removePack(language: PackLanguage): Promise<void> {
  await uninstallLanguagePack(language);
  setze(language, { installed: null, phase: 'idle', progress: 0 });
}

/** Der Zustand einer Sprache, mit Neuzeichnen bei jeder Änderung. */
export function usePackStatus(language: PackLanguage): PackStatus {
  return useSyncExternalStore(abonniere, () => stand.get(language) ?? LEER, () => LEER);
}

/** Neuere Version veröffentlicht als die installierte? */
export function updateAvailable(status: PackStatus): boolean {
  return status.installed !== null && !!status.latest && status.latest.version > status.installed;
}

/** „98 MB“ — gerundete Megabyte für Knöpfe. */
export function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/** Nur für Tests. */
export function resetPackState(): void {
  stand.clear();
  abgefragt.clear();
}
