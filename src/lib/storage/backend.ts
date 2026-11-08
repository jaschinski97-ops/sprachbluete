import * as SQLite from 'expo-sqlite';

import { CollectionName, DataStore } from './types';

/**
 * Natives Backend (iOS/Android): eine einzige SQLite-Tabelle als
 * Dokumentspeicher.
 *
 * Metro wählt für Web stattdessen `backend.web.ts` — der Web-Pfad von
 * `expo-sqlite` braucht SharedArrayBuffer und damit Cross-Origin-Isolation,
 * die weder der Dev-Server noch ein statischer Export liefert (AE-3).
 */

const DB_NAME = 'thai-lernbegleiter.db';

class SQLiteDataStore implements DataStore {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        value      TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
    `);
    this.db = db;
  }

  private requireDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('DataStore.init() muss vor dem ersten Zugriff aufgerufen werden.');
    }
    return this.db;
  }

  /**
   * Führt die Arbeit in EINER SQLite-Transaktion: Commit, wenn sie durchläuft,
   * Rollback, wenn sie wirft. Nicht Teil des `DataStore`-Interface, sondern
   * eine optionale Fähigkeit — `transact` in `./index` nimmt sie, wo sie da
   * ist, und serialisiert sonst selbst.
   *
   * expo-sqlite sperrt bei `withTransactionAsync` NICHT exklusiv: parallele
   * Abfragen auf derselben Verbindung können in die laufende Transaktion
   * hineingeraten. Deshalb ruft `transact` das hier nur unter der Store-Sperre.
   */
  async withTransactionAsync<T>(work: () => Promise<T>): Promise<T> {
    let result: T | undefined;
    await this.requireDb().withTransactionAsync(async () => {
      result = await work();
    });
    return result as T;
  }

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    const row = await this.requireDb().getFirstAsync<{ value: string }>(
      'SELECT value FROM documents WHERE collection = ? AND id = ?',
      [collection, id]
    );
    return row ? (JSON.parse(row.value) as T) : null;
  }

  async getAll<T>(collection: CollectionName): Promise<T[]> {
    const rows = await this.requireDb().getAllAsync<{ value: string }>(
      'SELECT value FROM documents WHERE collection = ?',
      [collection]
    );
    return rows.map((row) => JSON.parse(row.value) as T);
  }

  async getEntries<T>(collection: CollectionName): Promise<{ id: string; value: T }[]> {
    const rows = await this.requireDb().getAllAsync<{ id: string; value: string }>(
      'SELECT id, value FROM documents WHERE collection = ?',
      [collection]
    );
    return rows.map((row) => ({ id: row.id, value: JSON.parse(row.value) as T }));
  }

  async put<T>(collection: CollectionName, id: string, value: T): Promise<void> {
    await this.requireDb().runAsync(
      'INSERT OR REPLACE INTO documents (collection, id, value) VALUES (?, ?, ?)',
      [collection, id, JSON.stringify(value)]
    );
  }

  async putMany<T>(
    collection: CollectionName,
    entries: { id: string; value: T }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const db = this.requireDb();
    // Eine Transaktion statt N einzelner Schreibvorgänge — beim Einspielen des
    // Vokabel-Grundstocks (Phase 2) macht das den Unterschied.
    await db.withTransactionAsync(async () => {
      const statement = await db.prepareAsync(
        'INSERT OR REPLACE INTO documents (collection, id, value) VALUES (?, ?, ?)'
      );
      try {
        for (const entry of entries) {
          await statement.executeAsync([collection, entry.id, JSON.stringify(entry.value)]);
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    await this.requireDb().runAsync('DELETE FROM documents WHERE collection = ? AND id = ?', [
      collection,
      id,
    ]);
  }

  async clear(collection: CollectionName): Promise<void> {
    await this.requireDb().runAsync('DELETE FROM documents WHERE collection = ?', [collection]);
  }
}

export function createDataStore(): DataStore {
  return new SQLiteDataStore();
}

export const BACKEND_NAME = 'expo-sqlite';
