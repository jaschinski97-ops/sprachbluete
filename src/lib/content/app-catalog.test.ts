import catalog from '../../content/catalog.json';
import { activeVocabulary } from '@/data/active-vocabulary';
import { isDeliverableEntry } from './audio-policy';
import { bundledDocuments, bundledEntry, isDeletedDraft, setLiveCatalog } from './bundled';
import { currentCatalog } from './catalog-state';
import type { ContentCatalog, ContentKind } from './types';

// Der App-Build bekommt `catalog.json` ohne Studio- und Prüfdaten
// (scripts/metro-app-catalog.cjs). Hier wird der ECHTE Katalog verschlankt und
// geprüft, dass die App beide Fassungen gleich sieht: dieselben auslieferbaren
// Einträge, derselbe Ton-Gate-Status, dieselben Dateien und Inhalte.
jest.unmock('../../content/catalog.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { slimCatalog } = require('../../../scripts/metro-app-catalog.cjs') as { slimCatalog: (value: ContentCatalog) => ContentCatalog };

const full = catalog as unknown as ContentCatalog;
const KINDS: ContentKind[] = ['vocabulary', 'situations', 'audio', 'images'];

function appView(value: ContentCatalog) {
  setLiveCatalog(value);
  const ids = Object.fromEntries(KINDS.map(kind => [kind, bundledDocuments(kind).map(doc => doc.id)]));
  const media = (['audio', 'images'] as const).flatMap(kind => ids[kind].map(id => {
    const entry = bundledEntry(kind, id);
    return [kind, id, entry?.asset, entry?.check?.status, entry?.check?.tone?.status];
  }));
  return {
    ids,
    media,
    deliverable: value.entries.map(entry => `${entry.kind}:${entry.id}:${isDeliverableEntry(entry)}`),
    vocabulary: bundledDocuments('vocabulary'),
    situations: bundledDocuments('situations'),
    active: activeVocabulary(),
  };
}

const original = currentCatalog();
afterAll(() => setLiveCatalog(original));

test('the slim app catalog keeps every app-facing answer of the full catalog', () => {
  const slim = slimCatalog(full);
  expect(appView(slim)).toEqual(appView(full));
  expect(slim.deleted).toEqual(full.deleted);
  expect(slim.clearedBefore).toEqual(full.clearedBefore);
  expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(full).length * 0.6);
});

test('deleted drafts stay hidden with the slim catalog', () => {
  const slim = slimCatalog(full);
  for (const key of Object.keys(full.deleted ?? {}).slice(0, 50)) {
    const [kind, ...rest] = key.split(':');
    const draft = { id: rest.join(':'), generatedAt: 0 };
    expect(isDeletedDraft(kind as ContentKind, draft, slim)).toBe(isDeletedDraft(kind as ContentKind, draft, full));
  }
});

test('the index follows catalog changes and survives callers that sort their copy', () => {
  const slim = slimCatalog(full);
  setLiveCatalog(slim);
  const words = bundledDocuments('vocabulary');
  const first = words[0];
  words.reverse();
  expect(bundledDocuments('vocabulary')[0]).toBe(first);

  const clip = slim.entries.find(entry => entry.kind === 'audio')!;
  expect(bundledEntry('audio', clip.id)?.asset).toBe(clip.asset);
  setLiveCatalog({ ...slim, entries: slim.entries.filter(entry => entry !== clip) });
  expect(bundledEntry('audio', clip.id)).toBeUndefined();
});
