import { BatchProgress, missingFrom, runBatch } from '../generation/batch';
import { bundledEntry, isDeletedDraft } from '../content/bundled';
import { BatchTask } from '../generation/types';
import { DataStore, getStore } from '../storage';

import { getImageBlobStore } from './blob-store';
import { buildImagePrompt, ImageGenerationClient } from './generator';
import { assertConcreteSpec } from './plan';
import { isRejectedImageAsset } from './reviewed-assets';
import {
  base64ByteLength,
  blobKeyFor,
  ImageBlobStore,
  ImageSpec,
  VocabImage,
} from './types';

/**
 * Der Lauf für Vokabelbilder.
 *
 * Nutzt denselben Läufer wie die Sprachsituationen (`lib/generation/batch.ts`)
 * — sofort speichern, Fehler überleben, fortsetzbar, abbrechbar. Hier steht
 * nur, was Bilder ausmacht: die zweiteilige Ablage und das isConcrete-Tor.
 */

export type ImageRunOptions = {
  specs: ImageSpec[];
  client: ImageGenerationClient;
  store?: DataStore;
  blobStore?: ImageBlobStore;
  onProgress?: (progress: BatchProgress) => void;
  shouldCancel?: () => boolean;
  delayMs?: number;
  now?: () => number;
  onProduced?: (document: VocabImage, base64: string) => Promise<void>;
};

/**
 * Ein Bild gilt nur dann als vorhanden, wenn **beides** da ist: das
 * Metadaten-Dokument und die Bilddatei. Ein Dokument ohne Datei wäre eine
 * Karteileiche — die Karte zeigte eine leere Fläche, und ein zweiter Lauf
 * würde sie überspringen statt sie zu reparieren.
 */
function imageExists(db: DataStore, blobs: ImageBlobStore) {
  return {
    async exists(spec: ImageSpec) {
      const bundled = bundledEntry('images', spec.id);
      // Redaktionell geprüfte Motive bleiben, auch mit altem Prompt.
      if (bundled?.asset && bundled.check?.scope === 'schema-integrity-decode-motif-review') return true;
      if (bundled?.asset) return isCurrentImage(spec, bundled.document as VocabImage, bundled.asset);
      const doc = await db.get<VocabImage>('images', spec.id);
      if (!doc || isDeletedDraft('images', doc)) return false;
      return isCurrentImage(spec, doc, doc.blobKey) && blobs.has(doc.blobKey);
    },
  };
}

/**
 * Bildprüfung 04.10.2026: Ein Bild aus einem älteren Prompt oder mit
 * gesperrtem Motiv gilt als fehlend, damit der nächste Lauf es ersetzt. Ohne
 * gespeicherten Prompt (alte Handbilder) bleibt es stehen.
 */
function isCurrentImage(spec: ImageSpec, doc: VocabImage, asset: string): boolean {
  if (isRejectedImageAsset(asset)) return false;
  return !doc.prompt || doc.prompt === buildImagePrompt(spec);
}

function imageTask(
  client: ImageGenerationClient,
  db: DataStore,
  blobs: ImageBlobStore,
  now: () => number,
  onProduced?: ImageRunOptions['onProduced']
): BatchTask<ImageSpec> {
  return {
    ...imageExists(db, blobs),
    async produce(spec) {
      // Zweite Sperre des isConcrete-Tors — vor dem Netzaufruf, damit ein
      // abstrakter Eintrag die Pipeline gar nicht erst betritt.
      assertConcreteSpec(spec);

      const image = await client.generate(spec);
      const blobKey = blobKeyFor(spec.vocabId, image.format);

      // Reihenfolge mit Absicht: erst die Bilddaten, dann das Dokument. Bricht
      // die App dazwischen ab, fehlt das Dokument — der Eintrag gilt als nicht
      // vorhanden und wird beim nächsten Lauf sauber neu erzeugt. Andersherum
      // entstünde genau die Karteileiche, die `exists` oben verhindern soll.

      const doc: VocabImage = {
        id: spec.id,
        vocabId: spec.vocabId,
        format: image.format,
        byteSize: base64ByteLength(image.base64),
        blobKey,
        prompt: image.prompt,
        model: image.model,
        generatedAt: now(),
      };
      if (onProduced) { await onProduced(doc, image.base64); return; }
      await blobs.put(blobKey, image.base64);
      await db.put('images', spec.id, doc);
    },
  };
}

export async function runImageBatch(options: ImageRunOptions): Promise<BatchProgress> {
  const db = options.store ?? (await getStore());
  const blobs = options.blobStore ?? (await getImageBlobStore());
  return runBatch({
    specs: options.specs,
    task: imageTask(options.client, db, blobs, options.now ?? Date.now, options.onProduced),
    onProgress: options.onProgress,
    shouldCancel: options.shouldCancel,
    delayMs: options.delayMs,
  });
}

/** Welche Bilder aus dem Plan noch fehlen. */
export async function missingImageSpecs(
  specs: ImageSpec[],
  store?: DataStore,
  blobStore?: ImageBlobStore
): Promise<ImageSpec[]> {
  const db = store ?? (await getStore());
  const blobs = blobStore ?? (await getImageBlobStore());
  return missingFrom(specs, imageExists(db, blobs));
}
