import { Asset } from 'expo-asset';
import catalog from '../../content/catalog.json';
import { CONTENT_ASSETS } from '../../content/assets';
import type { ContentCatalog } from './types';
import { loadAudioClips, loadVocabImageUri, loadVocabImages } from '../repository';
import { playPronunciation, setPronunciationBackend } from '../audio';
import { installClipLookup, invalidateClipIndex } from '../clips/lookup';
import { bundledAssetUri } from './bundled';
import { isRejectedImageAsset } from '../images/reviewed-assets';

// Unlike the isolated storage unit tests, exercise the real checked-in catalog
// and its static asset map. Exact exported media bytes are checked separately.
jest.unmock('../../content/catalog.json');
jest.mock('../storage', () => ({ getStore: async () => { throw Error('Draft storage unavailable'); } }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({
  downloadAsync: async () => ({ localUri: 'file:///embedded/media', uri: 'https://must-not-use.invalid' }),
})) } }));

test('every shipped media entry resolves in production with no network, draft storage or system voice', async () => {
  const previousDev = __DEV__;
  const previousFetch = global.fetch;
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  global.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  const playAsset = jest.fn(async () => {});
  const speak = jest.fn(async () => { throw Error('System voice unavailable'); });
  setPronunciationBackend({ playAsset, speak, stop: async () => {}, availableLocales: async () => [] });
  invalidateClipIndex();
  installClipLookup();
  try {
    const entries = (catalog as ContentCatalog).entries;
    expect(Object.keys(CONTENT_ASSETS).sort()).toEqual([...new Set(entries.flatMap(entry => entry.asset ? [entry.asset] : []))].sort());
    const audio = entries.filter(entry => entry.kind === 'audio');
    const images = entries.filter(entry => entry.kind === 'images');
    expect(await loadAudioClips()).toEqual(audio.map(entry => entry.document));
    expect(await loadVocabImages()).toEqual(images.map(entry => entry.document));
    for (const entry of [...audio, ...images]) {
      expect(['passed', 'unchecked']).toContain(entry.check?.status);
      expect(entry.check?.status === 'unchecked' ? ['ungeprüft'] : ['automatisch geprüft', 'Motiv redaktionell geprüft']).toContain(entry.check?.label);
      expect(CONTENT_ASSETS[entry.asset!]).toBeDefined();
      if (entry.kind === 'audio') {
        const clip = entry.document as { text: string; language: 'th' | 'de' | 'en' | 'es' };
        expect(await playPronunciation({ ...clip, purpose: 'vocabulary' })).toBe('asset');
      } else {
        // Rejected motives remain recoverable in Studio, but never appear in
        // learner cards. Their underlying embedded files must still resolve.
        expect(await bundledAssetUri('images', entry.id)).toBe('file:///embedded/media');
        expect(await loadVocabImageUri(entry.id)).toBe(isRejectedImageAsset(entry.asset) ? null : 'file:///embedded/media');
      }
      expect(Asset.fromModule).toHaveBeenLastCalledWith(CONTENT_ASSETS[entry.asset!]);
    }
    expect(playAsset).toHaveBeenCalledTimes(audio.length);
    expect(speak).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    global.fetch = previousFetch;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = previousDev;
    setPronunciationBackend(null);
  }
});
