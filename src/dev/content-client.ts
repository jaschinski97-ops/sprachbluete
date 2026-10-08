import { getStore } from '@/lib/storage';
import { getAudioBlobStore } from '@/lib/clips/blob-store';
import { getImageBlobStore } from '@/lib/images/blob-store';
import { isContentDeveloper } from '@/lib/content/developer';
import type { ContentCatalog, ContentEntry } from '@/lib/content/types';
import { isDeletedDraft, setLiveCatalog } from '@/lib/content/bundled';
import { invalidateClipIndex } from '@/lib/clips/lookup';
import { loadVocabulary } from '@/lib/repository';
import { currentCatalog } from '@/lib/content/catalog-state';

export async function clearContentSelection(kind: 'vocabulary' | 'situations' | 'images' | 'audio', languages: string[]) {
  const result = await studioRequest<{ katalog: number; stage: number }>('/catalog/clear-selection', { kind, languages });
  const state = await studioRequest<StudioState>('/state');
  setLiveCatalog(state.shipped);
  const db = await getStore();
  const words = await loadVocabulary();
  const collection = kind === 'vocabulary' ? 'vocab' : kind;
  const docs = await db.getAll<{ id: string; language?: string; direction?: string; vocabId?: string; blobKey?: string }>(collection);
  for (const doc of docs) {
    const language = kind === 'situations' ? doc.direction?.split('_to_')[1] : kind === 'images' ? words.find(w => w.id === doc.vocabId)?.language : doc.language;
    if (!languages.includes(language ?? '') || (kind === 'vocabulary' && !doc.id.startsWith('ki-'))) continue;
    await db.remove(collection, doc.id);
    if (doc.blobKey && (kind === 'audio' || kind === 'images')) {
      const blobs = kind === 'audio' ? await getAudioBlobStore() : await getImageBlobStore();
      await blobs.remove(doc.blobKey);
    }
  }
  invalidateClipIndex();
  return result;
}

export const STUDIO_URL = 'http://127.0.0.1:8082';
/** One durable delivery per new item. One in-flight handoff can overlap the
 * next model request; awaiting the previous item bounds memory and failures. */
export async function startAutomaticDelivery(onDelivered?: (count: number) => void) {
  const { token } = await studioRequest<{ token: string }>('/delivery/start', {});
  let pending: Promise<void> = Promise.resolve();
  let handoff: Promise<void> = Promise.resolve();
  let count = 0;
  let failure: unknown;
  let finalized = false;
  const heartbeat = setInterval(() => {
    void studioRequest('/delivery/touch', { token }).catch(error => { failure = error; });
  }, 30000);
  return {
    get failed() { return failure !== undefined; },
    deliver(kind: ContentEntry['kind'], document: unknown, base64?: string) {
      // Audio workers may arrive together: serialize enqueueing as well as HTTP.
      handoff = handoff.then(async () => {
        await pending;
        if (failure) throw failure;
        pending = studioRequest<ContentEntry>('/delivery/item', { token, kind, document, base64 }).then(entry => {
          const catalog = currentCatalog();
          setLiveCatalog({ ...catalog, entries: [...catalog.entries.filter(item => item.kind !== entry.kind || item.id !== entry.id), entry] });
          invalidateClipIndex(); count += 1; onDelivered?.(count);
        });
        // Keep a rejection observed until finish/deliver propagates it to the UI.
        void pending.catch(error => { failure = error; });
      });
      void handoff.catch(error => { failure = error; });
      return handoff;
    },
    async finish() {
      clearInterval(heartbeat);
      try { await handoff; await pending; } catch (error) { failure = error; }
      if (!finalized) {
        await studioRequest('/delivery/finish', { token });
        finalized = true;
      }
      if (failure) throw failure;
      return count;
    },
    async flush() { await handoff; await pending; if (failure) throw failure; },
  };
}
/** Ein Berichtseintrag des Live-Berichts (Phase 2, Schritt 1): Check plus
 *  die Anzeige- und Aktionsfelder, die die Pipeline aus Stage ∪ Katalog
 *  ableitet. */
export type ReportEntry = ContentEntry['check'] & {
  kind: string;
  id: string;
  text?: string;
  language?: string;
  sourceId?: string;
  clipKind?: string;
  asset?: string;
  digest?: string;
  /** Grund der Prüfung (Tonwiderrspruch, fehlende Messung …). */
  reason?: string;
};
export type StudioState = {
  stage: ContentCatalog;
  shipped: ContentCatalog;
  report: { limitations?: string; entries: ReportEntry[] };
};
/**
 * Löscht einen Inhalt: `where: 'stage'` nimmt einen Entwurf aus dem Stage,
 * `where: 'catalog'` löscht einen ausgelieferten Eintrag aus Katalog
 * (inkl. Stage-Zwilling und verwaistem Asset). `true`, wenn etwas entfernt
 * wurde.
 */
export async function deleteContent(
  kind: string,
  id: string,
  where: 'stage' | 'catalog'
): Promise<boolean> {
  const removed = await studioRequest<boolean>(
    where === 'stage' ? '/stage/delete' : '/catalog/delete',
    { kind, id }
  );
  return removed === true;
}
export async function studioRequest<T>(path: string, data?: unknown): Promise<T> {
  if (!isContentDeveloper()) throw new Error('Inhaltsstudio nur lokal im Entwicklerbetrieb.');
  let response: Response;
  try {
    response = await fetch(STUDIO_URL + path, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
  } catch { throw new Error('Lokales Inhaltsstudio nicht erreichbar. Im Repo „npm run content:studio“ starten.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Inhaltsexport fehlgeschlagen.');
  if (path === '/state') setLiveCatalog((result as StudioState).shipped);
  return result as T;
}
/**
 * JSON-Form mit sortierten Objektschlüsseln — zwei inhaltsgleiche Dokumente
 * ergeben denselben String, egal in welcher Reihenfolge die Felder entstanden
 * sind. Grundlage des Export-Vergleichs unten.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const felder = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${felder.map(([name, inhalt]) => `${JSON.stringify(name)}:${stableStringify(inhalt)}`).join(',')}}`;
}

/** One item at a time; never collect the complete PCM corpus in memory/JSON. */
export async function exportDrafts(onProgress: (message: string) => void, options?: {
  kinds?: readonly ('situations' | 'images' | 'audio')[];
  publish?: boolean;
}): Promise<void> {
  const state = await studioRequest<StudioState>('/state');
  setLiveCatalog(state.shipped);
  const db = await getStore();
  let exported = 0;

  // 17.09. Nacht: Der Export spiegelt den GESAMTEN lokalen Store — bei ~2.500
  // Clips bedeutete das 15 Minuten Wartezeit am Ende JEDES Laufs, obwohl fast
  // alles unverändert in der Stage liegt (jeder Bekannte erneut samt Base64-
  // Audio hochgeladen). Deshalb: den Stage-Stand je kind:id merken und nur das
  // Neue oder Geänderte wirklich senden. Der Publish läuft wie bisher immer —
  // er sichert auch Stage-Reste ab, die von einem abgebrochenen Lauf blieben.
  const stageStand = new Map<string, string>();
  for (const eintrag of state.stage.entries ?? []) {
    if (eintrag && typeof eintrag === 'object' && 'id' in eintrag) {
      stageStand.set(`${eintrag.kind}:${eintrag.id}`, stableStringify(eintrag.document));
    }
  }
  const unveraendertInStage = (kind: string, document: { id: string }) => {
    const dort = stageStand.get(`${kind}:${document.id}`);
    return dort !== undefined && dort === stableStringify(document);
  };

  const failures: string[] = [];
  for (const kind of ['situations', 'images', 'audio'] as const) {
    if (options?.kinds && !options.kinds.includes(kind)) continue;
    const docs = await db.getAll<unknown>(kind);
    for (const document of docs) {
      let id = '(ungültiger Eintrag)';
      try {
        if (!document || typeof document !== 'object' || Array.isArray(document) ||
            !('id' in document) || typeof document.id !== 'string' || !document.id) {
          throw new Error('Inhaltsmetadaten oder ID fehlen.');
        }
        id = document.id;
        if (isDeletedDraft(kind, document as { id: string; generatedAt?: number }, state.shipped)) continue;
        if (unveraendertInStage(kind, document as { id: string })) continue;
        // Nur alle 20 Dokumente melden: bei 3.000 Clips wäre jede Einzel­meldung
        // ein Re-Render der ganzen Einstellungsseite. Das Endergebnis unten
        // erscheint immer.
        if (exported % 20 === 0) onProgress(`${exported} exportiert · Prüfung läuft · ${kind}: ${id}`);
        let base64: string | undefined;
        if (kind === 'audio' || kind === 'images') {
          const blobs = kind === 'audio' ? await getAudioBlobStore() : await getImageBlobStore();
          if (!('blobKey' in document) || typeof document.blobKey !== 'string') throw new Error('Blob-Schlüssel fehlt.');
          const uri = await blobs.uri(document.blobKey);
          if (!uri?.startsWith('data:') || !uri.includes(';base64,')) throw new Error('Lokale Mediendatei fehlt.');
          base64 = uri.split(';base64,')[1];
        }
        await studioRequest('/stage', { kind, document, base64 });
        exported++;
      } catch (error) { failures.push(`${kind}:${id}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  if (options?.publish !== false) await studioRequest('/publish', {});
  await studioRequest('/state');
  onProgress(`${exported} exportiert · ${options?.publish === false ? 'Bildentwürfe im Stage; vor Veröffentlichung in der Diagnose prüfen' : 'Prüfbericht aktualisiert'} · ${failures.length} Exportfehler` + (failures.length ? `\n${failures.join('\n')}` : ''));
  if (failures.length) throw new Error(failures.join('\n'));
}
