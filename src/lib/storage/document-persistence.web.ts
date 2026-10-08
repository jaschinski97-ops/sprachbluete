import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLLECTIONS } from './types';

export interface DocumentPersistence {
  init(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(entries: [string, string][]): Promise<void>;
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

/** Documents and their migration backup share one atomic IndexedDB transaction.
 * Binary media continue to use their existing, separate blob databases. */
export class IndexedDocumentPersistence implements DocumentPersistence {
  private database: IDBDatabase | null = null;

  constructor(private readonly factory: IDBFactory) {}

  async init(): Promise<void> {
    if (this.database) return;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open('thai-lernbegleiter-documents', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('collections');
        request.result.createObjectStore('legacy-backup');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
    });
    this.database = database;
    database.onversionchange = () => { database.close(); this.database = null; };

    try {
      // Read before opening the write transaction: awaiting localStorage work
      // inside an IDB transaction can let the browser commit it prematurely.
      const legacy = await Promise.all(COLLECTIONS.map(async collection => {
        const key = `thai-lernbegleiter:${collection}`;
        return [key, await AsyncStorage.getItem(key)] as const;
      }));
      const existing = legacy.filter((entry): entry is readonly [string, string] => entry[1] !== null);
      if (!existing.length) return;
      const transaction = database.transaction(['collections', 'legacy-backup'], 'readwrite');
      const done = completed(transaction);
      const collections = transaction.objectStore('collections');
      const backup = transaction.objectStore('legacy-backup');
      for (const [key, raw] of existing) {
        // Preserve even a corrupt legacy value for recovery. A newer IndexedDB
        // value wins if cleanup was interrupted after an earlier migration.
        const previous = collections.get(key);
        previous.onsuccess = () => { if (previous.result === undefined) collections.put(raw, key); };
        const savedBackup = backup.get(key);
        savedBackup.onsuccess = () => { if (savedBackup.result === undefined) backup.put(raw, key); };
      }
      await done;
      // These are transferred copies, not discarded learner data. Cleanup
      // failure is harmless: the next startup retries without overwriting IDB.
      await AsyncStorage.multiRemove(existing.map(([key]) => key)).catch(() => {});
    } catch (error) {
      database.close();
      this.database = null;
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.database) throw new Error('Document persistence is not initialized');
    const transaction = this.database.transaction('collections', 'readonly');
    const done = completed(transaction);
    const request = transaction.objectStore('collections').get(key);
    await done;
    return typeof request.result === 'string' ? request.result : null;
  }

  async set(entries: [string, string][]): Promise<void> {
    if (!this.database) throw new Error('Document persistence is not initialized');
    const transaction = this.database.transaction('collections', 'readwrite');
    const done = completed(transaction);
    try {
      const store = transaction.objectStore('collections');
      for (const [key, raw] of entries) store.put(raw, key);
    } catch (error) {
      transaction.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  }
}

function asyncStoragePersistence(): DocumentPersistence {
  return {
    async init() {},
    get: key => AsyncStorage.getItem(key),
    set: entries => AsyncStorage.multiSet(entries),
  };
}

/** IndexedDB first; if it cannot open (blocked storage, some private windows),
 * keep working on localStorage instead of failing the whole app. A failed
 * migration leaves the legacy values untouched, so the fallback still sees them. */
export function createDocumentPersistence(factory: IDBFactory | undefined =
  typeof indexedDB !== 'undefined' ? indexedDB : undefined): DocumentPersistence {
  // SSR and the existing Node contract tests have no browser database.
  if (!factory) return asyncStoragePersistence();
  let active: DocumentPersistence = new IndexedDocumentPersistence(factory);
  return {
    async init() {
      try { await active.init(); }
      catch { active = asyncStoragePersistence(); }
    },
    get: key => active.get(key),
    set: entries => active.set(entries),
  };
}
