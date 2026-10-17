/**
 * Asset-Aufloesung ueber Sprachpakete.
 *
 * Auflösungsreihenfolge pro Clip (bindend, siehe ROADMAP v2):
 *
 *   1. Installiertes Paket — file://-URI in `<document>/packs/<lang>/v<N>/`.
 *   2. Eingebettetes Asset ueber die bestehende bundled.ts-Logik.
 *   3. (in audio.ts, unveraendert) expo-speech, sofern die Ton-Policy es zulaesst.
 *
 * Der Katalog bleibt eingebettet und ist weiterhin die inhaltliche Quelle:
 * Der Loader uebersetzt nur Clip-/Bild-ID -> Dateipfad im Paket. Dateinamen
 * im Paket:
 *
 *   audio/<blobKey>     z. B. audio/b63a...92fd.mp3  (= catalog entry.asset)
 *   images/<vocabId>.<ext>  WebP (bzw. PNG-Fallback vom Bau), Endung egal:
 *                       gesucht wird ueber den Praefix images/<id>. im
 *                       Datei-Index des Manifests.
 *
 * Kein Aufrufer muss zwischen Paket und eingebettetem Asset unterscheiden —
 * `resolveClipUri` in lib/clips/lookup fragt hier zuerst nach und faellt
 * transparent auf bundledAssetUri zurueck. Ohne Dateisystem (Web, Node-Test)
 * liefert alles null, und die App verhaelt sich wie vor der Paket-Architektur.
 */

import { bundledEntry } from '../content/bundled';
import type { PackLanguage } from './manifest';
import { File } from 'expo-file-system';

import { activePack, readInstalledManifest, type InstalledPack } from './store';

/** Datei-Index des aktiven Pakets je Sprache: relative Pfade im Paketordner. */
type PackIndex = {
  pack: InstalledPack;
  paths: Set<string>;
  /** Pfade, die laut Manifest existieren sollten, aber auf dem Gerät fehlen. */
  missing: Set<string>;
};

const indexCache = new Map<PackLanguage, PackIndex | null>();

/** Verwirft das gemerkte Paket-Index (nach Installation/Deinstallation rufen). */
export function invalidatePackCache(language?: PackLanguage): void {
  if (language) indexCache.delete(language);
  else indexCache.clear();
}

async function loadPackIndex(language: PackLanguage): Promise<PackIndex | null> {
  const cached = indexCache.get(language);
  if (cached !== undefined) return cached;
  const pack = await activePack(language);
  if (!pack) {
    indexCache.set(language, null);
    return null;
  }
  const manifest = await readInstalledManifest(language, pack.version);
  if (!manifest) {
    indexCache.set(language, null);
    return null;
  }
  const entry: PackIndex = {
    pack,
    paths: new Set(manifest.files.map((file) => file.path)),
    missing: new Set(),
  };
  indexCache.set(language, entry);
  return entry;
}

/**
 * file://-URI einer Datei im aktiven Paket, oder null.
 * Der Manifest-Index liegt im Arbeitsspeicher; die Existenzprüfung läuft nur
 * einmal je Pfad (Ergebnis wird gemerkt) — ein halb korruptes Paket (Manifest
 * intakt, Dateien weg) fällt so dauerhaft aufs eingebettete Asset zurück,
 * statt eine tote file://-URI zu liefern (Review P1-2, 2026-09-09).
 */
async function packFileUri(language: PackLanguage, relativePath: string | null): Promise<string | null> {
  if (!relativePath) return null;
  const index = await loadPackIndex(language);
  if (!index || !index.paths.has(relativePath)) return null;
  if (index.missing.has(relativePath)) return null;
  const uri = `${index.pack.uri}/${relativePath}`;
  let exists = true;
  try {
    exists = new File(uri).exists;
  } catch {
    // Kein natives Dateisystem (Web/Node-Test): als fehlend behandeln —
    // der bundled-Fallback ist in dieser Umgebung ohnehin die Quelle.
    exists = false;
  }
  if (!exists) {
    index.missing.add(relativePath);
    return null;
  }
  return uri;
}

/** URI eines Hörclips im aktiven Paket, sonst null. */
export async function packAudioUri(language: PackLanguage, clipId: string): Promise<string | null> {
  const entry = bundledEntry('audio', clipId);
  return packFileUri(language, entry?.asset ? `audio/${entry.asset}` : null);
}

/** URI eines Vokabelbilds im aktiven Paket, sonst null. */
export async function packImageUri(language: PackLanguage, vocabId: string): Promise<string | null> {
  const index = await loadPackIndex(language);
  if (!index) return null;
  // Endung bewusst offen lassen (webp, oder PNG-Fallback vom Pack-Bau).
  const prefix = `images/${vocabId}.`;
  const match = [...index.paths].find((path) => path.startsWith(prefix));
  return packFileUri(language, match ?? null);
}
