import { createDocumentPersistence, type DocumentPersistence } from './document-persistence.web';

import { CollectionName, DataStore } from './types';

/**
 * Web-Backend: eine Sammlung = ein JSON-Blob in IndexedDB.
 * Bestehende localStorage-Daten werden beim Start mit Sicherung übernommen.
 *
 * Grund für den eigenen Web-Pfad statt `expo-sqlite`: dessen Web-Pfad legt
 * SharedArrayBuffer an und synchronisiert über Atomics, was
 * Cross-Origin-Isolation (COOP/COEP) voraussetzt. Weder `expo start --web`
 * noch ein statischer Export auf fremdem Hosting liefert diese Header — siehe
 * AE-3 in PROGRESS.md.
 *
 * Die Sammlung wird beim ersten Zugriff in eine Map geladen und danach im
 * Speicher gehalten; Schreibvorgänge aktualisieren Map und Blob gemeinsam.
 * IndexedDB vermeidet die gemeinsame kleine localStorage-Quote für
 * Lernfortschritt und frühere Studio-Metadaten.
 */

const KEY_PREFIX = 'thai-lernbegleiter:';

function storageKey(collection: CollectionName): string {
  return `${KEY_PREFIX}${collection}`;
}

/**
 * Der Cache hält ausgepackte Objekte. Ohne Kopie beim Lesen und Schreiben
 * würden Aufrufer eine Referenz auf den Cache-Inhalt bekommen und könnten ihn
 * unbemerkt verändern — der SQLite- und der Memory-Store geben dagegen immer
 * frisch geparste Objekte zurück. Die Kopie hält alle drei Backends bei
 * gleichem Verhalten.
 */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class WebDataStore implements DataStore {
  constructor(private readonly persistence: DocumentPersistence = createDocumentPersistence()) {}
  private cache = new Map<CollectionName, Map<string, unknown>>();

  /**
   * JEDE Operation läuft durch dieselbe Kette: Zwei parallele Erstzugriffe
   * auf eine Sammlung erzeugten sonst je einen Bucket, und der zweite
   * überschrieb den Cache des ersten — samt der Einträge, die der erste
   * bereits hineingeschrieben hatte. Ebenso unserialisiert set→flush: der
   * letzte Flush gewann und warf die Einträge der anderen Schreibvorgänge weg.
   *
   * Bewusst EINE Kette für den ganzen Store statt einer je Sammlung: eine
   * Transaktion umfasst mehrere Sammlungen und müsste sonst mehrere Ketten
   * in fester Reihenfolge nehmen — Sperrreihenfolge ist genau die Art
   * Komplexität, die Deadlocks schreibt, und bei den Datenmengen dieser App
   * ist der Gewinn paralleler Zugriffe auf verschiedene Sammlungen null.
   */
  private chain: Promise<unknown> = Promise.resolve();

  /** > 0, solange eine Transaktion läuft: Zugriffe aus ihrer Mitte umgehen die Kette. */
  private txDepth = 0;
  /** Zustand der Sammlungen von VOR der Transaktion — null heißt: war nicht im Cache. */
  private txSnapshots = new Map<CollectionName, Map<string, unknown> | null>();
  /** In der Transaktion veränderte Sammlungen — sie werden gemeinsam am Ende geflusht. */
  private txDirty = new Set<CollectionName>();

  async init(): Promise<void> {
    await this.persistence.init();
  }

  /**
   * Transaktionale Schreibvorgänge für Aufrufer, die mehrere Dokumente
   * ATOMAR brauchen (siehe `transact` in `./index`): Schreibvorgänge aus dem
   * Inneren landen erst im Cache und werden gemeinsam geflusht; wirft die
   * Arbeit, wird der Cache auf den Zustand davor zurückgerollt und nichts
   * gelangt in die Persistenz. Im Browser schreibt eine IndexedDB-Transaktion
   * alle geänderten Sammlungen atomar; erst oncomplete bestätigt den Erfolg.
   */
  async withTransactionAsync<T>(work: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      this.txDepth += 1;
      try {
        const result = await work();
        const entries: [string, string][] = [];
        for (const collection of this.txDirty) {
          const bucket = this.cache.get(collection);
          if (bucket) entries.push([storageKey(collection), JSON.stringify(Object.fromEntries(bucket))]);
        }
        if (entries.length) await this.persistence.set(entries);
        return result;
      } catch (error) {
        for (const [collection, snapshot] of this.txSnapshots) {
          if (snapshot) this.cache.set(collection, snapshot);
          else this.cache.delete(collection);
        }
        throw error;
      } finally {
        this.txDepth = 0;
        this.txSnapshots.clear();
        this.txDirty.clear();
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation, operation);
    this.chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /** Innerhalb einer Transaktion gehört der Zugriff ihr; die Kette hält sie exklusiv. */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) return operation();
    return this.enqueue(operation);
  }

  private async loadNow(collection: CollectionName): Promise<Map<string, unknown>> {
    const cached = this.cache.get(collection);
    if (cached) return cached;

    let parsed: Record<string, unknown> = {};
    const raw = await this.persistence.get(storageKey(collection));
    try {
      if (raw) parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Beschädigter oder nicht lesbarer Blob: lieber leer starten als die App
      // blockieren. Der Lernfortschritt dieser Sammlung ist dann verloren,
      // alles andere läuft weiter.
      parsed = {};
    }

    const bucket = new Map<string, unknown>(Object.entries(parsed));
    this.cache.set(collection, bucket);
    return bucket;
  }

  private async flushNow(collection: CollectionName, bucket: Map<string, unknown>): Promise<void> {
    await this.persistence.set([[storageKey(collection), JSON.stringify(Object.fromEntries(bucket))]]);
  }

  /** Merkt sich für die rollback-fähige Transaktion, welche Sammlung sich ändert. */
  private noteMutation(collection: CollectionName): void {
    if (this.txDepth === 0) return;
    if (!this.txSnapshots.has(collection)) {
      const current = this.cache.get(collection);
      this.txSnapshots.set(collection, current ? new Map(current) : null);
    }
    this.txDirty.add(collection);
  }

  private async mutate(
    collection: CollectionName,
    change: (bucket: Map<string, unknown>) => void
  ): Promise<void> {
    await this.run(async () => {
      const bucket = await this.loadNow(collection);
      this.noteMutation(collection);
      const snapshot = new Map(bucket);
      change(bucket);
      // Außerhalb einer Transaktion wird sofort geflusht — innerhalb sammelt
      // die Transaktion die Sammlungen ein und flusht sie gemeinsam.
      if (this.txDepth === 0) {
        try { await this.flushNow(collection, bucket); }
        catch (error) { this.cache.set(collection, snapshot); throw error; }
      }
    });
  }

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    return this.run(async () => {
      const bucket = await this.loadNow(collection);
      return bucket.has(id) ? copy(bucket.get(id) as T) : null;
    });
  }

  async getAll<T>(collection: CollectionName): Promise<T[]> {
    return this.run(async () => {
      const bucket = await this.loadNow(collection);
      return [...bucket.values()].map((value) => copy(value)) as T[];
    });
  }

  async put<T>(collection: CollectionName, id: string, value: T): Promise<void> {
    await this.mutate(collection, (bucket) => {
      bucket.set(id, copy(value));
    });
  }

  async putMany<T>(
    collection: CollectionName,
    entries: { id: string; value: T }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.mutate(collection, (bucket) => {
      for (const entry of entries) {
        bucket.set(entry.id, copy(entry.value));
      }
    });
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    await this.mutate(collection, (bucket) => {
      bucket.delete(id);
    });
  }

  async clear(collection: CollectionName): Promise<void> {
    await this.mutate(collection, (bucket) => {
      bucket.clear();
    });
  }
}

export function createDataStore(persistence?: DocumentPersistence): DataStore {
  return new WebDataStore(persistence);
}

export const BACKEND_NAME = 'indexeddb';
