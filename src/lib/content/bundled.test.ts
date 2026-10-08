import { Asset } from 'expo-asset';
import { bundledAssetUri, bundledDocuments, preferBundled } from './bundled';
import { resolveClipUri, invalidateClipIndex } from '../clips/lookup';
import { loadSituations, loadVocabImageUri } from '../repository';
import { playPronunciation, setPronunciationBackend } from '../audio';
import { installClipLookup } from '../clips/lookup';

jest.mock('../../content/catalog.json', () => {
  const { clipIdFor } = require('../clips/types');
  return { version: 2, entries: [
    { kind: 'situations', id: 'approved', digest: 'good', document: { id: 'approved', title: 'Bundled' }, check: { status: 'passed' } },
    { kind: 'situations', id: 'pending', digest: 'pending', document: { id: 'pending' } },
    { kind: 'situations', id: 'rejected', digest: 'bad', document: { id: 'rejected' }, check: { status: 'failed' } },
    { kind: 'situations', id: 'altered', digest: 'new', document: { id: 'altered' }, check: { status: 'unchecked' } },
    { kind: 'audio', id: clipIdFor('en', 'hello'), digest: 'audio', document: { id: clipIdFor('en', 'hello') }, asset: 'test.mp3', check: { status: 'passed' } },
    { kind: 'images', id: 'house', digest: 'image', document: { id: 'house' }, asset: 'test.png', check: { status: 'passed' } },
  ] };
});
jest.mock('../../content/assets', () => ({ CONTENT_ASSETS: { 'test.mp3': 1, 'test.png': 2 } }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn((id: number) => ({ downloadAsync: async () => ({ localUri: `file:///embedded/${id}`, uri: 'https://must-not-use.invalid' }) })) } }));

test('only automatically checked documents load and the bundle wins over stale drafts', () => {
  expect(bundledDocuments('situations').map((doc) => doc.id)).toEqual(['approved']);
  expect(preferBundled('situations', [{ id: 'approved', title: 'Stale' } as never])[0].title).toBe('Bundled');
});

test('cold production load and playback work with network, system voices and draft storage unavailable', async () => {
  const previous = __DEV__;
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  const playAsset = jest.fn(async () => {});
  const speak = jest.fn(async () => { throw Error('No system voice'); });
  setPronunciationBackend({ playAsset, speak, stop: async () => {}, availableLocales: async () => [] });
  invalidateClipIndex();
  installClipLookup();
  try {
    expect((await loadSituations()).map((situation) => situation.id)).toEqual(['approved']);
    expect(await loadVocabImageUri('house')).toBe('file:///embedded/2');
    expect(await resolveClipUri({ text: 'hello', language: 'en' })).toBe('file:///embedded/1');
    expect(await playPronunciation({ text: 'hello', language: 'en' })).toBe('asset');
    expect(playAsset).toHaveBeenCalledWith('file:///embedded/1');
    expect(speak).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await bundledAssetUri('audio', 'missing')).toBeNull();
    expect(Asset.fromModule).toHaveBeenCalled();
  } finally {
    global.fetch = previousFetch;
    setPronunciationBackend(null);
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = previous;
  }
});
