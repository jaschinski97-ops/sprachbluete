import { CATALOG_FILES } from '../../content/catalog-files';
import type { LanguageCode } from '../languages/types';
import { readCatalogAsset, type CatalogFileText } from './catalog-loader';
import { catalogIndex, installLanguage, isLanguageLoaded, isSplitCatalog, loadedLanguages, removeLanguage } from './catalog-state';
import type { LanguageCatalogFile } from './types';

/**
 * Welche Lernsprachen im App-Build geladen sind (Katalog je Lernsprache,
 * Schritt 1).
 *
 * - `ensureLanguages` lädt fehlende Sprachen; Aufrufer warten darauf, bevor
 *   sie synchron weiterarbeiten (Ladetor, Sprachwechsel, Lern-, Gesprächs-
 *   und Fortschritts-Reiter, `ensureCardStates`).
 * - Geladen bleiben höchstens `MAX_LOADED_LANGUAGES`, die zuletzt angefragten
 *   zuerst. Was ein Bildschirm hält (`holdLanguages`, Hook
 *   `useCatalogLanguages`), wird nie entladen — ein gemounteter Reiter sieht
 *   also nie einen leeren Katalog. Lern- und Gesprächssprache sind damit
 *   beide da, auch wenn sie verschieden sind.
 * - Im Entwicklungsbau (voller Katalog im Modul) tut das alles nichts.
 *
 * Jede Ladung schreibt `[catalog] <lang>: asset … ms, read … ms, parse … ms`
 * ins JS-Log; daraus liest der Messplan (scripts/measure-android-start.sh).
 */

export const MAX_LOADED_LANGUAGES = 2;
/** Länger wartet das Ladetor nicht: dann Fehlerbildschirm statt ewigem Splash. */
export const LOAD_TIMEOUT_MS = 10_000;

export class CatalogLoadError extends Error {
  constructor(readonly language: LanguageCode, message: string) {
    super(message);
    this.name = 'CatalogLoadError';
  }
}

export type CatalogSource = {
  files: Partial<Record<LanguageCode, number>>;
  read: (moduleId: number) => Promise<CatalogFileText>;
};
let source: CatalogSource = { files: CATALOG_FILES, read: readCatalogAsset };

/** Tests: eigene Sprachdateien und eigener Leser statt der eingebetteten Assets. */
export function setCatalogSource(next: CatalogSource): void {
  source = next;
}

const pending = new Map<LanguageCode, Promise<void>>();
const holds = new Map<LanguageCode, number>();
/** Zuletzt angefragt zuerst — bestimmt, was beim Überlauf entladen wird. */
let recent: LanguageCode[] = [];

function touch(languages: readonly LanguageCode[]): void {
  recent = [...languages, ...recent.filter((code) => !languages.includes(code))];
}

/** Was mit einer Sprachdatei nicht stimmt, oder `null`. */
export function catalogFileProblem(file: unknown, language: LanguageCode): string | null {
  const value = file as Partial<LanguageCatalogFile> | null;
  if (!value || typeof value !== 'object') return `Sprachdatei ${language} ist leer.`;
  if (value.format !== 1) return `Sprachdatei ${language} hat ein unbekanntes Format (${String(value.format)}).`;
  if (value.language !== language) return `Sprachdatei ${language} enthält ${String(value.language)}.`;
  if (!Array.isArray(value.entries)) return `Sprachdatei ${language} hat keine Einträge.`;
  const expected = catalogIndex()?.sourceCatalogSha256;
  if (expected && value.sourceCatalogSha256 !== expected) return `Sprachdatei ${language} passt nicht zum Index dieses Builds.`;
  return null;
}

async function readLanguage(language: LanguageCode): Promise<void> {
  const moduleId = source.files[language];
  if (moduleId === undefined) throw new CatalogLoadError(language, `Keine Sprachdatei für ${language} in diesem Build.`);
  const { text, assetMs, readMs } = await source.read(moduleId);
  const parseStarted = Date.now();
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new CatalogLoadError(language, `Sprachdatei ${language} ist beschädigt.`);
  }
  const parseMs = Date.now() - parseStarted;
  const problem = catalogFileProblem(file, language);
  if (problem) throw new CatalogLoadError(language, problem);
  const entries = (file as LanguageCatalogFile).entries;
  installLanguage(language, entries);
  console.log(`[catalog] ${language}: asset ${assetMs} ms, read ${readMs} ms, parse ${parseMs} ms, ${(text.length / 1e6).toFixed(2)} M chars, ${entries.length} entries`);
}

function withTimeout(work: Promise<void>, language: LanguageCode): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CatalogLoadError(language, `Sprachdatei ${language} lädt länger als ${LOAD_TIMEOUT_MS / 1000} s.`)), LOAD_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function loadLanguage(language: LanguageCode): Promise<void> {
  if (isLanguageLoaded(language)) return Promise.resolve();
  let running = pending.get(language);
  if (!running) {
    running = withTimeout(readLanguage(language), language).finally(() => pending.delete(language));
    pending.set(language, running);
  }
  return running;
}

/**
 * Entlädt die am längsten nicht angefragten Sprachen über der Grenze — nie
 * gehaltene, ladende oder gerade angefragte.
 */
function evictUnused(requested: readonly LanguageCode[] = []): void {
  const loaded = loadedLanguages();
  if (loaded.length <= MAX_LOADED_LANGUAGES) return;
  const rank = (code: LanguageCode) => {
    const at = recent.indexOf(code);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  let count = loaded.length;
  for (const code of [...loaded].sort((a, b) => rank(b) - rank(a))) {
    if (count <= MAX_LOADED_LANGUAGES) break;
    if ((holds.get(code) ?? 0) > 0 || pending.has(code) || requested.includes(code)) continue;
    removeLanguage(code);
    count -= 1;
    console.log(`[catalog] ${code}: entladen`);
  }
}

/** Lädt die Sprachen, die fehlen. Im Entwicklungsbau sofort erfüllt. */
export async function ensureLanguages(languages: readonly LanguageCode[]): Promise<void> {
  if (!isSplitCatalog() || languages.length === 0) return;
  touch(languages);
  const missing = languages.filter((code) => !isLanguageLoaded(code));
  const started = Date.now();
  await Promise.all(languages.map(loadLanguage));
  if (missing.length > 0) console.log(`[catalog] ensure ${missing.join('+')}: ${Date.now() - started} ms`);
  evictUnused(languages);
}

/** Ein Bildschirm braucht diese Sprachen; sie bleiben geladen, bis die Rückgabe gerufen wird. */
export function holdLanguages(languages: readonly LanguageCode[]): () => void {
  for (const code of languages) holds.set(code, (holds.get(code) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const code of languages) holds.set(code, Math.max(0, (holds.get(code) ?? 0) - 1));
    evictUnused();
  };
}
