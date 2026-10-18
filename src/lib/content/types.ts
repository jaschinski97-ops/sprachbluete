import type { AudioClip } from '../clips/types';
import type { ConversationSituation } from '../conversation/types';
import type { VocabImage } from '../images/types';
import type { VocabEntry } from '@/data/vocab-types';

// Phase 2, Schritt 4: 'vocabulary' ist die vierte + fünfte … Inhaltsart —
// KI-erzeugter Wortschatz läuft über Stage UND catalog.json wie alles andere.
export type ContentKind = 'situations' | 'images' | 'audio' | 'vocabulary';
export type ContentDocuments = {
  situations: ConversationSituation;
  images: VocabImage;
  audio: AudioClip;
  vocabulary: VocabEntry;
};
export type ContentCheck = {
  status: 'passed' | 'failed' | 'unchecked';
  label: 'automatisch geprüft' | 'ungeprüft' | 'aussortiert' | 'Motiv redaktionell geprüft';
  checkedAt: string;
  /** `…-motif-review`: Bildmotiv zusätzlich redaktionell geprüft (Audit 04.10.2026). */
  scope: 'schema-integrity-decode' | 'schema-language' | 'schema-integrity-decode-motif-review';
  tone?: import('./tone-gate').ToneCheck;
  /** Grund bei 'aussortiert' oder 'ungeprüft' (Phase 2, Schritt 1). */
  reason?: string;
};
export type ContentEntry<K extends ContentKind = ContentKind> = {
  kind: K;
  id: string;
  document: ContentDocuments[K];
  digest: string;
  asset?: string;
  sourceBytes?: number;
  byteSize?: number;
  check?: ContentCheck;
};
export type ContentCatalog = { version: 2; vocabularySource?: 'generated'; entries: ContentEntry[]; deleted?: Record<string, number>; clearedBefore?: Record<string, number> };

/**
 * Der Index im App-Build (Katalog je Lernsprache, scripts/app-catalog-files.cjs):
 * Statt des Inhalts trägt `catalog.json` dort `entries: []` und dieses Feld.
 * Die Einträge kommen je Lernsprache aus `assets/catalog/`.
 */
export type CatalogIndex = {
  format: 1;
  /** sha256 der `catalog.json`, aus der Index und Sprachdateien entstanden sind. */
  sourceCatalogSha256: string;
  /** Je Lernsprache die IDs des auslieferbaren Wortschatzes (Anzahlen, Datenpflege). */
  languages: Partial<Record<string, { vocabulary: string[] }>>;
};

/** Eine Sprachdatei des App-Builds (`assets/catalog/<lang>.catalog`). */
export type LanguageCatalogFile = {
  format: 1;
  language: string;
  sourceCatalogSha256: string;
  entries: ContentEntry[];
};
