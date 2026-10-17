import { MemoryBlobStore } from './memory';
import { BlobStore, BlobStoreConfig } from './types';

/**
 * Liefert die Ablage der Plattform für einen Namen (`images`, `audio`).
 * Metro wählt `backend.ts` (expo-file-system, nativ) oder `backend.web.ts`
 * (IndexedDB) — die Aufrufer merken davon nichts.
 *
 * Dasselbe Muster wie beim Dokumentspeicher (`lib/storage/index.ts`):
 * schlägt die Initialisierung fehl, läuft die App mit einem Speicher im
 * Arbeitsspeicher weiter, statt gar nicht zu starten. `activeBlobBackend`
 * sagt, was tatsächlich läuft.
 *
 * Das Plattform-Backend wird **verzögert** geladen (`await import`), nicht am
 * Modulkopf: `expo-file-system` ist ein natives Modul und lässt sich im
 * Jest-Prozess nicht ohne Weiteres importieren. So bleiben alle Aufrufer
 * testbar, die die Ablage gar nicht anfassen.
 */

const stores = new Map<string, Promise<BlobStore>>();
const activeBackends = new Map<string, string>();

export function getBlobStore(config: BlobStoreConfig): Promise<BlobStore> {
  let pending = stores.get(config.name);
  if (!pending) {
    pending = (async () => {
      let backendName = 'unbekannt';
      try {
        const backend = await import('./backend');
        backendName = backend.BLOB_BACKEND_NAME;
        const store = backend.createBlobStore(config);
        await store.init();
        activeBackends.set(config.name, backendName);
        return store;
      } catch (error) {
        console.warn(
          `[blobs] Ablage "${config.name}" (${backendName}) konnte nicht initialisiert werden, ` +
            'weiter im Arbeitsspeicher.',
          error
        );
        const fallback = new MemoryBlobStore(config);
        await fallback.init();
        activeBackends.set(config.name, 'memory (fallback)');
        return fallback;
      }
    })();
    stores.set(config.name, pending);
  }
  return pending;
}

export function activeBlobBackend(name: string): string {
  return activeBackends.get(name) ?? 'noch nicht geladen';
}
