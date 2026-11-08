import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  applyBackupToStore,
  BackupError,
  buildBackupDocument,
  hasLearningData,
  parseBackupText,
  type BackupImportSummary,
} from './backup';
import { dayKey } from './review-log';
import { isStorageDegraded, type DataStore } from './storage';

/**
 * Die automatische Sicherung auf dem Gerät (08.11.2026, Nutzerwunsch: auf
 * dem iPhone keine Datei über das Teilen-Menü ausgeben müssen).
 *
 * Die App schreibt einmal am Tag (genauer: beim Start und beim Wechsel in
 * den Hintergrund, höchstens alle zehn Minuten) dieselbe Sicherung wie der
 * Datei-Export in ihren eigenen Ordner — eine Datei je Tag, die letzten
 * sieben bleiben. Kein Netz, kein Dialog.
 *
 * Wogegen sie hilft und wogegen nicht:
 * - Beschädigte Daten, ein Fehler in einer neuen App-Version, eine
 *   versehentliche Wiederherstellung: ja, aus der Liste in den Einstellungen.
 * - Neues iPhone: Der Ordner liegt in den „Dokumenten“ der App und kommt mit
 *   dem Geräte-Backup (iCloud oder Computer) mit — wie die Lerndaten selbst.
 * - App gelöscht: nein, der Ordner wird mit gelöscht. Dafür bleibt der
 *   Datei-Export (`exportBackup`).
 *
 * Vor jeder Wiederherstellung wird der aktuelle Stand als
 * `vor-wiederherstellung.json` abgelegt, damit sie sich zurücknehmen lässt.
 * Ein leerer Lernstand wird nie geschrieben (er überschriebe sonst nach einem
 * Datenverlust die gute Tagessicherung), ebenso wenig, solange die App auf
 * dem Notfall-Speicher läuft.
 */

/** Die Ablage der Sicherungen — nativ ein Ordner, im Web IndexedDB, im Test ein Fake. */
export interface LocalBackupFiles {
  /** Wie viele Tagessicherungen bleiben. */
  keep: number;
  list(): Promise<string[]>;
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export const LOCAL_BACKUP_DAYS = 7;
export const BEFORE_RESTORE_FILE = 'vor-wiederherstellung.json';
const FOLDER = 'sicherungen';
const WEB_DATABASE = 'sprachbluete-sicherungen';
const WEB_STORE = 'dateien';
const DAY_FILE = /^sicherung-(\d{4}-\d{2}-\d{2})\.json$/;

export function dayFileName(now: number): string {
  return `sicherung-${dayKey(now)}.json`;
}

export type LocalBackup = {
  name: string;
  /** Tag der Sicherung (`YYYY-MM-DD`); `null` beim Stand vor der Wiederherstellung. */
  day: string | null;
};

/**
 * Nach `docs.expo.dev/versions/v57.0.0/sdk/filesystem/`: `Paths.document`
 * bleibt, bis die App gelöscht wird, und gehört zum Geräte-Backup —
 * anders als `Paths.cache`, das das System räumen darf.
 */
function nativeFiles(): LocalBackupFiles {
  const folder = (): Directory => {
    const directory = new Directory(Paths.document, FOLDER);
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    return directory;
  };
  return {
    keep: LOCAL_BACKUP_DAYS,
    async list() {
      return folder().list().flatMap((entry) => (entry instanceof File ? [entry.name] : []));
    },
    async read(name) {
      const file = new File(folder(), name);
      return file.exists ? file.text() : null;
    },
    async write(name, text) {
      const file = new File(folder(), name);
      if (!file.exists) file.create({ overwrite: true });
      file.write(text);
    },
    async remove(name) {
      const file = new File(folder(), name);
      if (file.exists) file.delete();
    },
  };
}

function openWebDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(WEB_DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WEB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function webRequest<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const database = await openWebDatabase();
  if (!database) return null;
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(WEB_STORE, mode);
      const request = work(transaction.objectStore(WEB_STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

/**
 * Im Web eine eigene IndexedDB-Datenbank, getrennt von den Lerndaten.
 * Nicht `localStorage`: Eine Sicherung kann mehrere MB groß sein (gemessen
 * 2,6 MB mit 15.575 Karten), `localStorage` fasst je Seite rund 5 MB.
 */
function webFiles(): LocalBackupFiles {
  return {
    keep: LOCAL_BACKUP_DAYS,
    async list() {
      return ((await webRequest('readonly', (store) => store.getAllKeys())) ?? []).map(String);
    },
    async read(name) {
      const value = await webRequest<unknown>('readonly', (store) => store.get(name));
      return typeof value === 'string' ? value : null;
    },
    async write(name, text) {
      await webRequest('readwrite', (store) => store.put(text, name));
    },
    async remove(name) {
      await webRequest('readwrite', (store) => store.delete(name));
    },
  };
}

export function deviceBackupFiles(): LocalBackupFiles {
  return Platform.OS === 'web' ? webFiles() : nativeFiles();
}

/** Die vorhandenen Sicherungen, neueste zuerst; der Stand vor der Wiederherstellung zuletzt. */
export async function listLocalBackups(files: LocalBackupFiles = deviceBackupFiles()): Promise<LocalBackup[]> {
  const names = await files.list();
  const days = names
    .flatMap((name): LocalBackup[] => {
      const match = DAY_FILE.exec(name);
      return match ? [{ name, day: match[1] }] : [];
    })
    .sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''));
  return names.includes(BEFORE_RESTORE_FILE) ? [...days, { name: BEFORE_RESTORE_FILE, day: null }] : days;
}

export type LocalBackupResult = 'written' | 'empty' | 'skipped';

/**
 * Schreibt die Tagessicherung (ein zweiter Lauf am selben Tag ersetzt sie)
 * und räumt ältere Tage weg.
 */
export async function writeLocalBackup(
  options: { store?: DataStore; files?: LocalBackupFiles; now?: number } = {}
): Promise<LocalBackupResult> {
  if (!options.store && (await isStorageDegraded())) return 'skipped';
  const now = options.now ?? Date.now();
  const document = await buildBackupDocument(options.store, now);
  if (!hasLearningData(document.data)) return 'empty';
  const files = options.files ?? deviceBackupFiles();
  await files.write(dayFileName(now), JSON.stringify(document));
  const backups = await listLocalBackups(files);
  const old = backups.filter((backup) => backup.day !== null).slice(files.keep);
  for (const backup of old) await files.remove(backup.name);
  return 'written';
}

/**
 * Holt eine Sicherung zurück. Erst prüfen, dann den aktuellen Stand ablegen,
 * dann ersetzen — eine unbrauchbare Datei ändert nichts.
 */
export async function restoreLocalBackup(
  name: string,
  options: { store?: DataStore; files?: LocalBackupFiles; now?: number } = {}
): Promise<BackupImportSummary> {
  const files = options.files ?? deviceBackupFiles();
  const text = await files.read(name);
  if (text === null) throw new BackupError('backup.errUnreadable');
  const { data, exportedAt } = parseBackupText(text);
  const current = await buildBackupDocument(options.store, options.now ?? Date.now());
  // Auch beim Zurückholen des Stands davor: Dann tauschen die beiden, und
  // ein zweiter Druck nimmt auch das zurück.
  if (hasLearningData(current.data)) await files.write(BEFORE_RESTORE_FILE, JSON.stringify(current));
  const summary = await applyBackupToStore(data, options.store);
  return { ...summary, exportedAt };
}
