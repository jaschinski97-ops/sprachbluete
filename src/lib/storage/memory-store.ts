import { CollectionName, DataStore } from './types';

/**
 * Speicher im Arbeitsspeicher, ohne Persistenz.
 *
 * Zweck: Tests und als Notnagel, falls ein Plattform-Backend beim Start
 * ausfällt — dann läuft die App weiter, merkt sich den Fortschritt aber nur
 * bis zum Schließen.
 */
export class MemoryDataStore implements DataStore {
  private data = new Map<CollectionName, Map<string, string>>();

  async init(): Promise<void> {
    // nichts zu tun
  }

  private bucket(collection: CollectionName): Map<string, string> {
    let bucket = this.data.get(collection);
    if (!bucket) {
      bucket = new Map();
      this.data.set(collection, bucket);
    }
    return bucket;
  }

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    const raw = this.bucket(collection).get(id);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  async getAll<T>(collection: CollectionName): Promise<T[]> {
    return [...this.bucket(collection).values()].map((raw) => JSON.parse(raw) as T);
  }

  async getEntries<T>(collection: CollectionName): Promise<{ id: string; value: T }[]> {
    return [...this.bucket(collection).entries()].map(([id, raw]) => ({ id, value: JSON.parse(raw) as T }));
  }

  async put<T>(collection: CollectionName, id: string, value: T): Promise<void> {
    this.bucket(collection).set(id, JSON.stringify(value));
  }

  async putMany<T>(
    collection: CollectionName,
    entries: { id: string; value: T }[]
  ): Promise<void> {
    const bucket = this.bucket(collection);
    for (const entry of entries) {
      bucket.set(entry.id, JSON.stringify(entry.value));
    }
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    this.bucket(collection).delete(id);
  }

  async clear(collection: CollectionName): Promise<void> {
    this.bucket(collection).clear();
  }
}
