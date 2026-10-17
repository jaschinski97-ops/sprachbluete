import { activeBlobBackend, getBlobStore } from '../blobs/store';

import { IMAGE_BLOB_CONFIG, ImageBlobStore } from './types';

/**
 * Die Bildablage der Plattform — seit Phase 11 ein Name in der allgemeinen
 * Blob-Ablage (`lib/blobs`), die auch die Hörclips trägt. Aufrufer und
 * Verhalten sind unverändert: verzögert geladen, mit Notnagel im
 * Arbeitsspeicher, `getActiveBlobBackend()` sagt, was wirklich läuft.
 */
export function getImageBlobStore(): Promise<ImageBlobStore> {
  return getBlobStore(IMAGE_BLOB_CONFIG);
}

export function getActiveBlobBackend(): string {
  return activeBlobBackend(IMAGE_BLOB_CONFIG.name);
}
