/**
 * Tests fuer den Paket-Speicher: Versions-Erkennung, Aktivierung,
 * Loeschen und Aufraeumen — alles gegen das In-Memory-Dateisystem.
 */
jest.mock('expo-file-system', () => require('./packs-test-fs').createMock());

const mock = require('expo-file-system') as import('./packs-test-fs').MockFileSystem;

import type { PackLanguage, PackManifest } from './manifest';
import {
  activePack,
  activatePack,
  deactivatePack,
  installedPackUri,
  installedVersions,
  pruneOldVersions,
  readInstalledManifest,
  removePack,
  versionFromDirName,
} from './store';

const LANG: PackLanguage = 'th';

function validManifest(language: PackLanguage, version: number): PackManifest {
  return {
    schemaVersion: 1,
    language,
    version,
    createdAt: '2026-09-09T00:00:00.000Z',
    sourceCatalogSha256: 'a'.repeat(64),
    files: [{ path: `audio/aa${version}.mp3`, sha256: 'b'.repeat(64), bytes: 4 }],
    totals: { audio: 1, images: 0, bytes: 4 },
  };
}

function seedPack(language: PackLanguage, version: number): void {
  mock.__seedFile(`${installedPackUri(language, version)}/manifest.json`, JSON.stringify(validManifest(language, version)));
  mock.__seedFile(`${installedPackUri(language, version)}/audio/aa${version}.mp3`, Buffer.alloc(4, 7));
}

beforeEach(() => {
  mock.__reset();
});

describe('pure helpers', () => {
  test('versionFromDirName accepts only v<N>', () => {
    expect(versionFromDirName('v12')).toBe(12);
    expect(versionFromDirName('v0')).toBeNull();
    expect(versionFromDirName('junk')).toBeNull();
    expect(versionFromDirName('')).toBeNull();
  });
});

describe('installedVersions', () => {
  test('detects installed versions by manifest, ascending', async () => {
    seedPack(LANG, 2);
    seedPack(LANG, 1);
    mock.__seedFile(`${installedPackUri(LANG, 3)}/audio/only.mp3`, Buffer.alloc(1)); // ohne manifest
    expect(await installedVersions(LANG)).toEqual([1, 2]);
    expect(await installedVersions('es')).toEqual([]); // nie installiert
  });
});

describe('activate and read active pack', () => {
  test('activating an installed version writes the marker and is readable', async () => {
    seedPack(LANG, 1);
    await activatePack(LANG, 1);
    const active = await activePack(LANG);
    expect(active).toMatchObject({ language: LANG, version: 1 });
    const manifest = await readInstalledManifest(LANG, 1);
    expect(manifest?.totals.bytes).toBe(4);
    expect(await installedVersions(LANG)).toEqual([1]);
    expect(await activePack(LANG)).toEqual({ language: LANG, version: 1, uri: installedPackUri(LANG, 1) });
  });

  test('activating a missing version fails loudly', async () => {
    await expect(activatePack(LANG, 42)).rejects.toThrow('nicht (gueltig) installiert');
  });

  test('an active marker without a package reads as nothing active', async () => {
    mock.__seedFile(`file:///mock-doc/packs/${LANG}/active.json`, JSON.stringify({ language: LANG, version: 5, activatedAt: 'x' }));
    expect(await activePack(LANG)).toBeNull();
  });
});

describe('remove and prune', () => {
  test('removePack deletes the folder and clears the marker when active', async () => {
    seedPack(LANG, 1);
    seedPack(LANG, 2);
    await activatePack(LANG, 1);
    await removePack(LANG, 1);
    expect(await installedVersions(LANG)).toEqual([2]);
    expect(await activePack(LANG)).toBeNull(); // aktive Version wurde entfernt
    seedPack(LANG, 1);
    await activatePack(LANG, 1);
    await removePack(LANG, 2); // nicht aktiv
    expect((await activePack(LANG))?.version).toBe(1);
  });

  test('pruneOldVersions keeps only the kept version', async () => {
    seedPack(LANG, 1);
    seedPack(LANG, 2);
    seedPack(LANG, 3);
    await activatePack(LANG, 3);
    const removed = await pruneOldVersions(LANG, 3);
    expect(removed.sort()).toEqual([1, 2]);
    expect(await installedVersions(LANG)).toEqual([3]);
    expect((await activePack(LANG))?.version).toBe(3);
  });

  test('deactivatePack removes only the marker', async () => {
    seedPack(LANG, 1);
    await activatePack(LANG, 1);
    await deactivatePack(LANG);
    expect(await activePack(LANG)).toBeNull();
    expect(await installedVersions(LANG)).toEqual([1]);
  });
});
