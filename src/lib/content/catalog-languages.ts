import { CATALOG_FILES, type CatalogFileSet } from '../../content/catalog-files';
import type { UiLanguage } from '../i18n/types';
import type { LanguageCode } from '../languages/types';
import { readCatalogAsset, type CatalogFileText } from './catalog-loader';
import { catalogIndex, installLanguage, isLanguageLoaded, isSplitCatalog, loadedLanguages, refreshCatalog, removeLanguage } from './catalog-state';
import type { AudioRow, ContentEntry, LanguageCatalogFile, TranslationPartFile } from './types';

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
 * - Schritt 1b: Zu jeder Lernsprache kommen nur die Übersetzungen der
 *   App-Sprache und Englisch (`bridgeText` fällt darauf zurück).
 *   `setCatalogUiLanguage` lädt beim Wechsel der App-Sprache die Teile der
 *   geladenen Sprachen nach; der I18nProvider wartet darauf.
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
  files: Partial<Record<LanguageCode, CatalogFileSet>>;
  read: (moduleId: number) => Promise<CatalogFileText>;
};
let source: CatalogSource = { files: CATALOG_FILES, read: readCatalogAsset };

/** Tests: eigene Sprachdateien und eigener Leser statt der eingebetteten Assets. */
export function setCatalogSource(next: CatalogSource): void {
  source = next;
}

const pending = new Map<LanguageCode, Promise<void>>();
/** Je geladener Sprache: Dokumente mit Übersetzungen nach Art und ID, und welche Teile schon drin sind. */
type LoadedTexts = { documents: Map<string, { translations?: Record<string, unknown> }>; parts: Set<UiLanguage> };
const texts = new Map<LanguageCode, LoadedTexts>();
/** Die App-Sprache, deren Übersetzungen geladen werden (setzt der I18nProvider). */
let activeUi: UiLanguage = 'en';
const uiParts = (ui: UiLanguage): UiLanguage[] => (ui === 'en' ? ['en'] : [ui, 'en']);
const holds = new Map<LanguageCode, number>();
/** Zuletzt angefragt zuerst — bestimmt, was beim Überlauf entladen wird. */
let recent: LanguageCode[] = [];

function touch(languages: readonly LanguageCode[]): void {
  recent = [...languages, ...recent.filter((code) => !languages.includes(code))];
}

const sameBuild = (sha: unknown) => {
  const expected = catalogIndex()?.sourceCatalogSha256;
  return !expected || sha === expected;
};

/** Was mit einer Sprachdatei (Basis) nicht stimmt, oder `null`. */
export function catalogFileProblem(file: unknown, language: LanguageCode): string | null {
  const value = file as Partial<LanguageCatalogFile> | null;
  if (!value || typeof value !== 'object') return `Sprachdatei ${language} ist leer.`;
  if (value.format !== 2) return `Sprachdatei ${language} hat ein unbekanntes Format (${String(value.format)}).`;
  if (value.language !== language) return `Sprachdatei ${language} enthält ${String(value.language)}.`;
  if (!Array.isArray(value.entries) || !Array.isArray(value.audio)) return `Sprachdatei ${language} hat keine Einträge.`;
  if (!sameBuild(value.sourceCatalogSha256)) return `Sprachdatei ${language} passt nicht zum Index dieses Builds.`;
  return null;
}

function partProblem(file: unknown, language: LanguageCode, ui: UiLanguage): string | null {
  const value = file as Partial<TranslationPartFile> | null;
  const name = `Übersetzungen ${language}-${ui}`;
  if (!value || typeof value !== 'object' || value.format !== 2) return `${name} haben ein unbekanntes Format.`;
  if (value.language !== language || value.ui !== ui) return `${name} enthalten ${String(value.language)}-${String(value.ui)}.`;
  if (!value.vocabulary || !value.situations) return `${name} sind unvollständig.`;
  if (!sameBuild(value.sourceCatalogSha256)) return `${name} passen nicht zum Index dieses Builds.`;
  return null;
}

/** Die Tabellenzeile eines Hörclips als schlanker Eintrag (Gegenstück zu `audioRow` im Erzeuger). */
export function audioEntryFromRow([id, language, asset, status, tone]: AudioRow): ContentEntry {
  const entry: Record<string, unknown> = { kind: 'audio', id, document: { id, language } };
  if (asset !== null) entry.asset = asset;
  if (status !== null) entry.check = tone !== null ? { status, tone: { status: tone } } : { status };
  return entry as ContentEntry;
}

type Parsed<T> = { file: T; assetMs: number; readMs: number; parseMs: number; chars: number };

async function readJson<T>(language: LanguageCode, moduleId: number | undefined, name: string, problem: (file: unknown) => string | null): Promise<Parsed<T>> {
  if (moduleId === undefined) throw new CatalogLoadError(language, `Keine Sprachdatei ${name} in diesem Build.`);
  const { text, assetMs, readMs } = await source.read(moduleId);
  const parseStarted = Date.now();
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new CatalogLoadError(language, `Sprachdatei ${name} ist beschädigt.`);
  }
  const parseMs = Date.now() - parseStarted;
  const found = problem(file);
  if (found) throw new CatalogLoadError(language, found);
  return { file: file as T, assetMs, readMs, parseMs, chars: text.length };
}

function readPart(language: LanguageCode, ui: UiLanguage): Promise<Parsed<TranslationPartFile>> {
  return readJson(language, source.files[language]?.translations[ui], `${language}-${ui}`, (file) => partProblem(file, language, ui));
}

/** Legt die Übersetzungen einer App-Sprache in die Dokumente (an Ort und Stelle). */
function mergePart(target: LoadedTexts, part: TranslationPartFile): void {
  for (const kind of ['vocabulary', 'situations'] as const) {
    for (const [id, value] of Object.entries(part[kind])) {
      const document = target.documents.get(`${kind}:${id}`);
      if (document) (document.translations ??= {})[part.ui] = value;
    }
  }
  target.parts.add(part.ui as UiLanguage);
}

async function readLanguage(language: LanguageCode): Promise<void> {
  const uis = uiParts(activeUi);
  const [base, ...parts] = await Promise.all([
    readJson<LanguageCatalogFile>(language, source.files[language]?.base, language, (file) => catalogFileProblem(file, language)),
    ...uis.map((ui) => readPart(language, ui)),
  ]);
  const entries = [...base.file.entries, ...base.file.audio.map(audioEntryFromRow)];
  const loaded: LoadedTexts = { documents: new Map(), parts: new Set() };
  for (const entry of entries) {
    if (entry.kind === 'vocabulary' || entry.kind === 'situations') loaded.documents.set(`${entry.kind}:${entry.id}`, entry.document as never);
  }
  for (const part of parts) mergePart(loaded, part.file);
  texts.set(language, loaded);
  installLanguage(language, entries);
  const all = [base, ...parts];
  console.log(
    `[catalog] ${language}: asset ${Math.max(...all.map((p) => p.assetMs))} ms, read ${Math.max(...all.map((p) => p.readMs))} ms, ` +
    `parse ${all.reduce((sum, p) => sum + p.parseMs, 0)} ms, ${(all.reduce((sum, p) => sum + p.chars, 0) / 1e6).toFixed(2)} M chars, ` +
    `${entries.length} entries, ${uis.join('+')}`
  );
}

function withTimeout<T>(work: Promise<T>, language: LanguageCode): Promise<T> {
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
    texts.delete(code);
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

/**
 * Die App-Sprache wechselt (oder steht beim Start fest): Ab jetzt kommen ihre
 * Übersetzungen mit; für die schon geladenen Lernsprachen werden sie
 * nachgeladen. Der I18nProvider schaltet erst danach um, so sieht kein
 * Bildschirm die neue Sprache ohne ihre Bedeutungen.
 */
export async function setCatalogUiLanguage(ui: UiLanguage): Promise<void> {
  activeUi = ui;
  if (!isSplitCatalog()) return;
  // Eine Ladung, die noch mit der alten App-Sprache begann, wird unten ergänzt.
  await Promise.allSettled([...pending.values()]);
  const started = Date.now();
  let merged = 0;
  await Promise.all(loadedLanguages().map(async (language) => {
    const loaded = texts.get(language);
    if (!loaded) return;
    const missing = uiParts(ui).filter((code) => !loaded.parts.has(code));
    const parts = await withTimeout(Promise.all(missing.map((code) => readPart(language, code))), language);
    for (const part of parts) mergePart(loaded, part.file);
    merged += parts.length;
  }));
  if (merged > 0) {
    refreshCatalog();
    console.log(`[catalog] App-Sprache ${ui}: ${merged} Teile in ${Date.now() - started} ms`);
  }
}
