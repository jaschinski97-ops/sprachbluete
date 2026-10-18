import shipped from '../../content/catalog.json';
import { LANGUAGE_CODES, type LanguageCode } from '../languages/types';
import type { CatalogIndex, ContentCatalog, ContentEntry } from './types';

/**
 * Der Inhaltskatalog zur Laufzeit — synchron für alle Aufrufer.
 *
 * KATALOG JE LERNSPRACHE (Schritt 1, docs/katalog-je-lernsprache-konzept.md):
 * Im App-Build ersetzt Metro `catalog.json` durch einen kleinen Index
 * (`appIndex`, `entries: []`); die Einträge kommen je Lernsprache aus einer
 * eingebetteten Datei und werden hier als Menge geführt. `currentCatalog()`
 * ist dann die Vereinigung der geladenen Sprachen, bei jeder Änderung ein
 * neues Objekt. Geladen wird in `catalog-languages.ts`; dieses Modul bleibt
 * frei von Expo und React Native, weil die Node-Werkzeuge es über
 * `scripts/content/domain.cjs` mitladen.
 *
 * Entwicklungsbau, Studio und Jest haben den vollen Katalog im Modul: Dort
 * gilt jede Sprache als geladen, und nichts ändert sich gegenüber vorher.
 */

const index: CatalogIndex | null = (shipped as { appIndex?: CatalogIndex }).appIndex ?? null;
const loaded = new Map<LanguageCode, ContentEntry[]>();
let current = shipped as unknown as ContentCatalog;
let revision = 0;
const listeners = new Set<() => void>();

function changed(): void {
  revision += 1;
  for (const listener of [...listeners]) listener();
}

export function currentCatalog(): ContentCatalog { return current; }

/** Studio und Tests: einen ganzen Katalog setzen (Entwicklungsweg, unverändert). */
export function setCurrentCatalog(catalog: ContentCatalog): void {
  if (!catalog || !Array.isArray(catalog.entries)) throw new Error('Der Inhaltskatalog ist unvollständig. Bitte Studio aktualisieren.');
  current = catalog;
  changed();
}

/** Zählt jede Änderung mit — Zwischenspeicher hängen daran statt an der Objektidentität. */
export function catalogRevision(): number { return revision; }

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** App-Build: Inhalt kommt je Lernsprache aus eigener Datei. */
export function isSplitCatalog(): boolean { return index !== null; }

/** Der Index des App-Builds, sonst `null` (voller Katalog im Modul). */
export function catalogIndex(): CatalogIndex | null { return index; }

export function isLanguageLoaded(language: LanguageCode): boolean {
  return index === null || loaded.has(language);
}

export function loadedLanguages(): LanguageCode[] {
  return index === null ? [...LANGUAGE_CODES] : LANGUAGE_CODES.filter((code) => loaded.has(code));
}

/**
 * Baut die Vereinigung neu. Reihenfolge nach `LANGUAGE_CODES`; bei doppelter
 * Art und ID (deutsche Bedeutungs-Clips stehen in mehreren Sprachdateien)
 * gilt der erste Eintrag — wie im vollen Katalog, der keine Doppel kennt.
 */
function rebuild(): void {
  const seen = new Set<string>();
  const entries: ContentEntry[] = [];
  for (const code of LANGUAGE_CODES) {
    for (const entry of loaded.get(code) ?? []) {
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  current = { ...(shipped as unknown as ContentCatalog), entries };
  changed();
}

/** Nimmt die Einträge einer geladenen Sprachdatei auf (nur App-Build). */
export function installLanguage(language: LanguageCode, entries: ContentEntry[]): void {
  if (index === null) return;
  loaded.set(language, entries);
  rebuild();
}

export function removeLanguage(language: LanguageCode): void {
  if (index === null || !loaded.delete(language)) return;
  rebuild();
}
