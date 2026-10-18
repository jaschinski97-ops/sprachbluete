import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import { CONTENT_ASSETS } from '../../content/assets';
import type { ContentCatalog, ContentDocuments, ContentEntry, ContentKind } from './types';
import { isDeliverableEntry } from './audio-policy';
import { catalogRevision, currentCatalog, setCurrentCatalog } from './catalog-state';

/**
 * Die auslieferbaren Einträge, einmal je Katalogstand nach Art und ID
 * abgelegt (18.10.2026). Vorher lief jeder Aufruf über alle 26.000 Einträge,
 * ein Tipp auf „Anhören" also viermal. Neu gebaut wird nach jeder Änderung
 * des Katalogs (`catalogRevision`): Studio, Tests und, im App-Build, jede
 * geladene oder entfernte Lernsprache.
 */
type DeliverableIndex = {
  revision: number;
  byId: Map<ContentKind, Map<string, ContentEntry>>;
  documents: Map<ContentKind, unknown[]>;
};
let index: DeliverableIndex | null = null;

function deliverableIndex(): DeliverableIndex {
  const revision = catalogRevision();
  if (index?.revision === revision) return index;
  const catalog = currentCatalog();
  const byId = new Map<ContentKind, Map<string, ContentEntry>>();
  const documents = new Map<ContentKind, unknown[]>();
  for (const entry of catalog.entries) {
    if (!isDeliverableEntry(entry)) continue;
    let ids = byId.get(entry.kind);
    if (!ids) byId.set(entry.kind, (ids = new Map()));
    // Wie das frühere `find`: Bei doppelter ID gilt der erste Eintrag.
    if (!ids.has(entry.id)) ids.set(entry.id, entry);
    let docs = documents.get(entry.kind);
    if (!docs) documents.set(entry.kind, (docs = []));
    docs.push(entry.document);
  }
  return (index = { revision, byId, documents });
}

/** Developer mutations are visible immediately, before Metro reloads the bundle. */
export function setLiveCatalog(value: ContentCatalog) {
  setCurrentCatalog(value);
}
export function isDeletedDraft(kind: ContentKind, doc: { id: string; generatedAt?: number; language?: string; direction?: string; vocabId?: string }, source: ContentCatalog = currentCatalog()) {
  if (kind === 'vocabulary' && !doc.id.startsWith('ki-')) return false;
  const language = doc.language ?? doc.direction?.split('_to_')[1] ?? (kind === 'images'
    ? [...source.entries.filter(entry => entry.kind === 'vocabulary').map(entry => entry.document as ContentDocuments['vocabulary'])].find(word => word.id === doc.vocabId)?.language
    : undefined);
  const cutoff = Math.max(source.deleted?.[`${kind}:${doc.id}`] ?? -1, source.clearedBefore?.[kind] ?? -1, source.clearedBefore?.[`${kind}:${language}`] ?? -1);
  return cutoff >= 0 && (doc.generatedAt ?? 0) <= cutoff;
}

export function bundledEntry(kind: ContentKind, id: string): ContentEntry | undefined {
  return deliverableIndex().byId.get(kind)?.get(id);
}

/** Eine eigene Kopie der Liste: Aufrufer dürfen sortieren, ohne den Index zu ändern. */
export function bundledDocuments<K extends ContentKind>(kind: K): ContentDocuments[K][] {
  return [...(deliverableIndex().documents.get(kind) ?? [])] as ContentDocuments[K][];
}

/**
 * Sprachpaket-Build (`THAISPEAKER_MEDIA=packs`, metro.config.js): Nativ ist
 * dann kein Medium eingebettet, Hörclips und Bilder kommen nur aus den
 * heruntergeladenen Paketen. Web liest weiter den `public/content`-Spiegel.
 */
export function mediaFromPacks(): boolean {
  return Platform.OS !== 'web' && Object.keys(CONTENT_ASSETS).length === 0;
}

export async function bundledAssetUri(kind: 'audio' | 'images', id: string): Promise<string | null> {
  const entry = bundledEntry(kind, id);
  if (!entry?.asset) return null;
  // WEB: URL statt require. Der Web-Bundle enthält die Binärdateien nicht
  // (assets.web.ts gegen den EMFILE-Kaltstart) — seitdem blieb jede
  // thailändische Aussprache stumm, weil Desktops keine th-Stimme mitbringen
  // (Nutzermeldung 2026-09-10). `public/content/` spiegelt die Dateien
  // (`npm run web:content`); Expo-web serviert den Ordner statisch, und die
  // Datei wird erst beim ersten Tipp auf „Anhören" geladen — der Kaltstart
  // bleibt vom Katalog unabhängig. Der Ton-Status im Katalog und damit das
  // Auslieferungs-Gate in `resolveClipUri` sind von diesem Weg nicht
  // berührt.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/content/${entry.asset}`;
  }
  const moduleId = CONTENT_ASSETS[entry.asset];
  if (moduleId === undefined) return null;
  // Metro collects the static requires into the native application resources.
  // downloadAsync resolves/copies that embedded resource on native, also after
  // an OS cache purge. No remote content URL is stored in the catalog.
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  return asset.localUri ?? asset.uri;
}

/** Shipped content wins over old local drafts, without touching learner state. */
export function preferBundled<K extends ContentKind>(kind: K, local: ContentDocuments[K][]): ContentDocuments[K][] {
  const combined = new Map(local.filter(doc => !isDeletedDraft(kind, doc)).map((doc) => [doc.id, doc]));
  for (const doc of bundledDocuments(kind)) combined.set(doc.id, doc);
  return [...combined.values()].sort((a, b) => a.id.localeCompare(b.id));
}
