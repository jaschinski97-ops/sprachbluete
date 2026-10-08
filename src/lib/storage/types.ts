/**
 * Persistenz-Abstraktion.
 *
 * Die Geschäftslogik spricht ausschließlich mit diesem Interface und weiß
 * nicht, ob dahinter SQLite (nativ) oder AsyncStorage (Web) steckt — siehe
 * AE-3 in PROGRESS.md.
 *
 * Bewusst ein Dokument-Speicher (Sammlung + ID + JSON-Wert) statt eines
 * relationalen Schemas: dieselbe schmale Schnittstelle lässt sich sowohl auf
 * eine SQLite-Tabelle als auch auf JSON-Blobs in AsyncStorage abbilden, ohne
 * dass eine der beiden Seiten Kompromisse eingehen muss.
 */

/** Alle persistierten Datentypen des Projekts. */
export type CollectionName =
  /** VocabEntry — der Vokabel-Grundstock (Phase 2). */
  | 'vocab'
  /** FSRSCardState — Kartenzustand je Vokabel und Richtung (Phase 1). */
  | 'cards'
  /** ConversationSituation — vorproduzierte Dialoge (Phase 4). */
  | 'situations'
  /**
   * VocabImage — Metadaten zu den Vokabelbildern (Phase 5). Die Bilddaten
   * selbst liegen NICHT hier, sondern im Blob-Speicher (`lib/images`) —
   * Begründung in AE-14.
   */
  | 'images'
  /**
   * AudioClip — Metadaten zu den Hörclips (Phase 11). Die Audiodaten liegen
   * wie die Bilder im Blob-Speicher (`lib/clips`), siehe AE-30.
   */
  | 'audio'
  /** ReviewDayLog — ein Dokument je Kalendertag mit Wiederholungszahlen (Phase 4). */
  | 'reviewLog'
  /** Einstellungen, Lernprofil, Zähler. */
  | 'meta';

export const COLLECTIONS: CollectionName[] = [
  'vocab',
  'cards',
  'situations',
  'images',
  'audio',
  'reviewLog',
  'meta',
];

export interface DataStore {
  /** Muss vor dem ersten Zugriff genau einmal aufgerufen werden. */
  init(): Promise<void>;

  get<T>(collection: CollectionName, id: string): Promise<T | null>;
  getAll<T>(collection: CollectionName): Promise<T[]>;
  put<T>(collection: CollectionName, id: string, value: T): Promise<void>;
  /** Ein Schreibvorgang für viele Einträge — deutlich schneller als put() in einer Schleife. */
  putMany<T>(collection: CollectionName, entries: { id: string; value: T }[]): Promise<void>;
  remove(collection: CollectionName, id: string): Promise<void>;
  clear(collection: CollectionName): Promise<void>;
}
