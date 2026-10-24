import type { PartOfSpeech } from '@/data/vocab-types';

import { BlobStore, BlobStoreConfig } from '../blobs/types';

/**
 * Bilder zu konkreten Vokabeln (Phase 5).
 *
 * WARUM ÜBERHAUPT BILDER: Dual-Coding-Theorie und Picture-Superiority-Effekt —
 * ein Begriff, der zusätzlich bildlich abgelegt wird, ist später leichter
 * abrufbar. Das gilt für **konkrete** Begriffe. Für Funktionswörter,
 * Partikeln und abstrakte Verben gibt es kein Bild, das den Begriff trifft;
 * ein Bild zu „nicht" oder „ครับ" wäre bestenfalls Dekoration und
 * schlimmstenfalls eine falsche Merkhilfe. Deshalb das harte Tor auf
 * `isConcrete` (AE-15).
 *
 * ZWEITEILIGE ABLAGE (AE-14): Das hier beschriebene Dokument enthält nur
 * **Metadaten** und liegt in der Sammlung `images` des Dokumentspeichers. Die
 * Bilddaten selbst liegen in einem eigenen Blob-Speicher, adressiert über
 * `blobKey`.
 */

export type ImageFormat = 'webp' | 'png' | 'jpeg';

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

/**
 * Was erzeugt werden soll.
 *
 * `isConcrete: true` ist bewusst ein **Literaltyp**, kein `boolean`: schon der
 * Typprüfer lehnt es ab, einen Auftrag aus einem abstrakten Eintrag zu bauen.
 * Zur Laufzeit prüft `imageSpecFor` zusätzlich (Daten aus dem Speicher tragen
 * keine Typen mehr) — siehe Pflicht 4 / AE-15.
 */
export type ImageSpec = {
  /**
   * Bild-ID: bei gemeinsamem Begriff `concept-<begriff>` (`imageIdFor`), sonst
   * die Vokabel-ID. Ein Begriff bekommt so in jeder Sprache dieselbe ID.
   */
  id: string;
  /** Das Wort, an dem der Auftrag geplant wurde (Anker; Prüfung, Anzeige). */
  vocabId: string;
  /** Gemeinsamer Begriff `c:…` — fehlt bei alten Bildern je Wort. */
  concept?: string;
  /** Sprach-Ausnahme: eigenes Bild nur für diese Lernsprache. */
  language?: string;
  thai: string;
  romanization: string;
  german: string;
  partOfSpeech: PartOfSpeech;
  /** Englische Motivbeschreibung aus `motifs.ts` — der Kern des Prompts. */
  motif: string;
  isConcrete: true;
};

/** Metadaten-Dokument in der Sammlung `images`. */
export type VocabImage = {
  /** `concept-<begriff>` (ggf. `-<sprache>`), bei altem Bestand die Vokabel-ID. */
  id: string;
  /** Anker-Wort; bei altem Bestand das Wort, zu dem das Bild gehört. */
  vocabId: string;
  /** Gemeinsamer Begriff `c:…`: jedes Wort dieses Begriffs zeigt das Bild. */
  concept?: string;
  /** Sprach-Ausnahme: gilt nur für diese Lernsprache, vor dem gemeinsamen Bild. */
  language?: string;
  format: ImageFormat;
  /** Größe der Bilddaten in Byte (dekodiert, nicht Base64). */
  byteSize: number;
  /** Schlüssel im Blob-Speicher, inklusive Endung. */
  blobKey: string;
  /** Der tatsächlich abgeschickte Prompt — macht ein Bild nachvollziehbar. */
  prompt: string;
  model: string;
  generatedAt: number;
};

/** Ergebnis eines einzelnen Generierungsaufrufs, noch nicht abgelegt. */
export type GeneratedImage = {
  base64: string;
  format: ImageFormat;
  model: string;
  /** Der tatsächlich abgeschickte Prompt — wandert ins Metadaten-Dokument. */
  prompt: string;
};

export function blobKeyFor(imageId: string, format: ImageFormat): string {
  return `${imageId}.${format}`;
}

export function formatOfKey(key: string): ImageFormat {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  if (extension === 'webp' || extension === 'png' || extension === 'jpeg') return extension;
  throw new Error(`Unbekannte Bildendung in "${key}".`);
}

/**
 * Ablage der reinen Bilddaten.
 *
 * Seit Phase 11 ist das die allgemeine Blob-Ablage aus `lib/blobs` — Bilder
 * und Hörclips brauchen dieselben fünf Operationen (AE-14, AE-30). Der Name
 * `images` ist Teil der gespeicherten Daten (IndexedDB
 * `thai-lernbegleiter-images`, Ordner `<Dokumente>/images/`) und bleibt.
 */
export type ImageBlobStore = BlobStore;

export const IMAGE_BLOB_CONFIG: BlobStoreConfig = {
  name: 'images',
  mimeOf: (key) => MIME_BY_FORMAT[formatOfKey(key)],
};

/**
 * Wie viele Byte stecken in einem Base64-String? Ohne ihn zu dekodieren:
 * je 4 Zeichen 3 Byte, abzüglich der Füllzeichen am Ende.
 */
export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  if (clean.length === 0) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, (clean.length * 3) / 4 - padding);
}
