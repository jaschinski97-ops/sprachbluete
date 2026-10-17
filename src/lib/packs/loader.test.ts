/**
 * Tests fuer den Loader: Datei-Index des aktiven Pakets, URI-Bau und die
 * Aufloesungsreihenfolge Paket -> eingebettetes Asset im Zusammenspiel mit
 * resolveClipUri (TTS-Politik bleibt Sache von audio.ts und ist dort getestet).
 */
import { clipIdFor } from '../clips/types';
import { invalidatePackCache, packAudioUri, packImageUri } from './loader';
import { activatePack, installedPackUri, type InstalledPack } from './store';
import { resolveClipUri } from '../clips/lookup';

jest.mock('expo-file-system', () => require('./packs-test-fs').createMock());

jest.mock('../../content/catalog.json', () => {
  const { clipIdFor } = require('../clips/types');
  const th = clipIdFor('th', 'สวัสดี');
  return {
    version: 2,
    entries: [
      {
        kind: 'audio',
        id: th,
        digest: 'audio',
        document: { id: th },
        asset: 'aabbcc.mp3',
        check: { status: 'passed', tone: { status: 'passed' } },
      },
      {
        kind: 'images',
        id: 'aahaan',
        digest: 'image',
        document: { id: 'aahaan' },
        asset: 'ddeeff.png',
        check: { status: 'passed' },
      },
    ],
  };
});

jest.mock('../../content/assets', () => ({ CONTENT_ASSETS: { 'aabbcc.mp3': 1, 'ddeeff.png': 2 } }));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn((id: number) => ({
      downloadAsync: async () => ({ localUri: `file:///embedded/${id}`, uri: 'https://must-not-use.invalid' }),
    })),
  },
}));

const mock = require('expo-file-system') as import('./packs-test-fs').MockFileSystem;

const TH_CLIP = clipIdFor('th', 'สวัสดี');

function seedThPack(): void {
  const root = installedPackUri('th', 1) as string;
  mock.__seedFile(`${root}/manifest.json`, JSON.stringify({
    schemaVersion: 1,
    language: 'th',
    version: 1,
    createdAt: '2026-09-09T00:00:00.000Z',
    sourceCatalogSha256: 'a'.repeat(64),
    files: [
      { path: 'audio/aabbcc.mp3', sha256: 'b'.repeat(64), bytes: 4 },
      { path: 'images/aahaan.webp', sha256: 'c'.repeat(64), bytes: 6 },
    ],
    totals: { audio: 1, images: 1, bytes: 10 },
  }));
  mock.__seedFile(`${root}/audio/aabbcc.mp3`, Buffer.alloc(4, 1));
  mock.__seedFile(`${root}/images/aahaan.webp`, Buffer.alloc(6, 1));
}

async function installThPack(): Promise<InstalledPack> {
  seedThPack();
  await activatePack('th', 1);
  invalidatePackCache();
  return { language: 'th', version: 1, uri: installedPackUri('th', 1) as string };
}

beforeEach(() => {
  mock.__reset();
  invalidatePackCache();
});

describe('packAudioUri / packImageUri', () => {
  test('resolves through the active pack index', async () => {
    const pack = await installThPack();
    expect(await packAudioUri('th', TH_CLIP)).toBe(`${pack.uri}/audio/aabbcc.mp3`);
    expect(await packImageUri('th', 'aahaan')).toBe(`${pack.uri}/images/aahaan.webp`);
    // Nicht im Paket (nie geliefert) -> null.
    expect(await packImageUri('th', 'unbekannt')).toBeNull();
    expect(await packAudioUri('es', TH_CLIP)).toBeNull();
  });

  test('without a package everything resolves to null', async () => {
    expect(await packAudioUri('th', TH_CLIP)).toBeNull();
    expect(await packImageUri('th', 'aahaan')).toBeNull();
  });
});

describe('resolution order pack -> bundled', () => {
  test('the installed pack wins over the embedded asset', async () => {
    const pack = await installThPack();
    expect(await resolveClipUri({ text: 'สวัสดี', language: 'th' })).toBe(`${pack.uri}/audio/aabbcc.mp3`);
  });

  test('without a pack the embedded asset answers, exactly as before', async () => {
    expect(await resolveClipUri({ text: 'สวัสดี', language: 'th' })).toBe('file:///embedded/1');
  });

  test('after removing the pack the loader falls back to the embedded asset', async () => {
    const pack = await installThPack();
    expect(await resolveClipUri({ text: 'สวัสดี', language: 'th' })).toBe(`${pack.uri}/audio/aabbcc.mp3`);
    // Paket vom Dateisystem nehmen; der Cache wird danach explizit verworfen
    // (in der App macht das downloader.ts nach jeder Installation/Löschung).
    new mock.Directory(pack.uri).delete();
    invalidatePackCache();
    expect(await resolveClipUri({ text: 'สวัสดี', language: 'th' })).toBe('file:///embedded/1');
  });
});
