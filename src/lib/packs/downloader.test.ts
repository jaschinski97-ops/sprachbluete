/**
 * Tests fuer den Installer: Versionswahl, URL-Bau (Override und GitHub),
 * Byte-Check vor dem Entpacken, Aktivierung und Aufraeumen — Netz, Entpacker
 * und Dateisystem sind dabei vollstaendig ersetzt.
 */
import { choosePackVersion, installLanguagePack, latestPackRelease, PackInstallError, type PackDownloadProgress } from './downloader';
import type { PackExtractor } from './extractor';
import type { PackConfig } from './config';
import { packZipUrl } from './config';
import { activatePack, activePack, installedPackUri, installedVersions } from './store';
import type { PackReleaseInfo } from './manifest';

jest.mock('expo-file-system', () => require('./packs-test-fs').createMock());

const mock = require('expo-file-system') as import('./packs-test-fs').MockFileSystem;

const OVERRIDE_CONFIG: PackConfig = { repo: 'OWNER/REPO', baseUrlOverride: 'http://localhost:8082/packs' };

function releaseFixture(version: number, zipBytes: number): PackReleaseInfo {
  return {
    schemaVersion: 1,
    language: 'th',
    version,
    createdAt: '2026-09-09T00:00:00.000Z',
    sourceCatalogSha256: 'a'.repeat(64),
    files: [{ path: 'audio/x.mp3', sha256: 'b'.repeat(64), bytes: 4 }],
    totals: { audio: 1, images: 0, bytes: 4 },
    zipBytes,
    zipSha256: 'c'.repeat(64),
  };
}

type FetchCall = { url: string };

function fakeFetch(responses: Map<string, string>, calls: FetchCall[] = []): typeof fetch {
  const impl = async (input: string | URL | Request): Promise<unknown> => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url });
    const body = responses.get(url);
    if (body === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
  return impl as unknown as typeof fetch;
}

/** Simuliert react-native-zip-archive: legt Manifest- und Payload-Dateien ab. */
function fakeExtractor(release: PackReleaseInfo): PackExtractor {
  return {
    async extract(_zipUri: string, destDirUri: string) {
      mock.__seedFile(`${destDirUri}/manifest.json`, JSON.stringify(release));
      for (const file of release.files) {
        mock.__seedFile(`${destDirUri}/${file.path}`, Buffer.alloc(file.bytes, 9));
      }
    },
  };
}

function seedInstalledActive(version: number): void {
  mock.__seedFile(`${installedPackUri('th', version)}/manifest.json`, JSON.stringify(releaseFixture(version, 10)));
}

beforeEach(() => {
  mock.__reset();
});

describe('choosePackVersion', () => {
  test('prefers the requested version when available', () => {
    expect(choosePackVersion([1], [1, 2, 3], 2)).toBe(2);
    expect(choosePackVersion([1], [1, 2, 3], 9)).toBeNull();
  });

  test('falls back to the newest available version', () => {
    expect(choosePackVersion([1, 2], [2, 5, 4])).toBe(5);
    expect(choosePackVersion([1], [])).toBeNull();
  });
});

describe('installLanguagePack via local helper override', () => {
  test('downloads, checks bytes, extracts, activates and prunes old versions', async () => {
    seedInstalledActive(1);
    const zip = Buffer.alloc(500, 1);
    const release = releaseFixture(2, zip.length);
    const indexUrl = 'http://localhost:8082/packs/th/index.json';
    const manifestUrl = `http://localhost:8082/packs/th/thai-pack-th-v2.manifest.json`;
    const zipUrl = packZipUrl(OVERRIDE_CONFIG, 'th', 2);
    const calls: FetchCall[] = [];
    const responses = new Map([
      [indexUrl, JSON.stringify({ language: 'th', versions: [1, 2], latest: 2 })],
      [manifestUrl, JSON.stringify(release)],
    ]);
    mock.__setDownload(zipUrl, zip);

    const progress: PackDownloadProgress[] = [];
    const result = await installLanguagePack('th', {
      deps: { fetch: fakeFetch(responses, calls), extractor: fakeExtractor(release), config: OVERRIDE_CONFIG },
      onProgress: (event) => progress.push(event),
    });

    expect(result).toMatchObject({ language: 'th', version: 2 });
    expect(calls.map((call) => call.url)).toEqual([indexUrl, manifestUrl]);
    // Entpackte Dateien am Installationsort, aktiv, alte Version weg.
    expect(mock.__fileAt(`${installedPackUri('th', 2)}/audio/x.mp3`)).toEqual(Buffer.alloc(4, 9));
    expect((await activePack('th'))?.version).toBe(2);
    expect(await installedVersions('th')).toEqual([2]);
    // Cache-Zip ist weg.
    expect(mock.__fileAt(`file:///mock-doc/packs/${packZipUrl(OVERRIDE_CONFIG, 'th', 2).split('/').pop()}`)).toBeUndefined();
    // Alle Stufen in sinnvoller Reihenfolge gemeldet (zweites 'download' =
    // Fortschritts-Event des Download-Tasks selbst).
    expect(progress.map((event) => event.stage)).toEqual([
      'version', 'manifest', 'download', 'download', 'extract', 'verify', 'cleanup', 'activate',
    ]);
    // Der letzte Download-Event ist der echte Fortschritt des Tasks.
    expect(progress.filter((event) => event.stage === 'download').pop())
      .toMatchObject({ bytesWritten: zip.length, totalBytes: zip.length });
  });

  test('rejects a truncated download before extracting anything', async () => {
    seedInstalledActive(1);
    await activatePack('th', 1);
    const release = releaseFixture(2, 500);
    mock.__setDownload(packZipUrl(OVERRIDE_CONFIG, 'th', 2), Buffer.alloc(120, 1)); // abgeschnitten
    let extractCalled = false;
    const extractor: PackExtractor = { async extract() { extractCalled = true; } };

    await expect(installLanguagePack('th', {
      version: 2,
      deps: {
        fetch: fakeFetch(new Map([
          ['http://localhost:8082/packs/th/index.json', JSON.stringify({ versions: [1, 2], latest: 2 })],
          ['http://localhost:8082/packs/th/thai-pack-th-v2.manifest.json', JSON.stringify(release)],
        ])),
        extractor,
        config: OVERRIDE_CONFIG,
      },
    })).rejects.toMatchObject({ stage: 'verify' });

    expect(extractCalled).toBe(false);
    expect(mock.__fileAt(`${installedPackUri('th', 2)}/manifest.json`)).toBeUndefined();
    expect((await activePack('th'))?.version).toBe(1); // fruehere Installation unangetastet
    // Cache-Zip aufgeraeumt, trotz Fehlschlag.
    expect(mock.__fileAt('file:///mock-doc/packs/thai-pack-th-v2.zip')).toBeUndefined();
  });

  test('fails with a clear stage when no extractor is available (dependency missing)', async () => {
    const release = releaseFixture(1, 10);
    mock.__setDownload(packZipUrl(OVERRIDE_CONFIG, 'th', 1), Buffer.alloc(10, 1));
    await expect(installLanguagePack('th', {
      deps: {
        fetch: fakeFetch(new Map([
          ['http://localhost:8082/packs/th/index.json', JSON.stringify({ versions: [1], latest: 1 })],
          ['http://localhost:8082/packs/th/thai-pack-th-v1.manifest.json', JSON.stringify(release)],
        ])),
        extractor: null,
        config: OVERRIDE_CONFIG,
      },
    })).rejects.toMatchObject({ stage: 'extract', message: expect.stringContaining('react-native-zip-archive') });
    expect(mock.__fileAt(`${installedPackUri('th', 1)}/manifest.json`)).toBeUndefined();
  });

  test('a preferred version that is not available aborts before any download', async () => {
    const calls: FetchCall[] = [];
    const responses = new Map([
      ['http://localhost:8082/packs/th/index.json', JSON.stringify({ versions: [1], latest: 1 })],
    ]);
    await expect(installLanguagePack('th', {
      version: 7,
      deps: { fetch: fakeFetch(responses, calls), extractor: null, config: OVERRIDE_CONFIG },
    })).rejects.toBeInstanceOf(PackInstallError);
    expect(calls.map((call) => call.url)).toEqual(['http://localhost:8082/packs/th/index.json']);
  });
});

describe('installLanguagePack via GitHub Releases', () => {
  test('builds the documented release URLs and picks the newest tag', async () => {
    const zip = Buffer.alloc(20, 2);
    const release = releaseFixture(3, zip.length);
    const calls: FetchCall[] = [];
    const api = 'https://api.github.com/repos/OWNER/REPO/releases?per_page=100';
    const manifestUrl = 'https://github.com/OWNER/REPO/releases/download/pack-th-v3/thai-pack-th-v3.manifest.json';
    const zipUrl = 'https://github.com/OWNER/REPO/releases/download/pack-th-v3/thai-pack-th-v3.zip';
    const responses = new Map([
      [api, JSON.stringify([{ tag_name: 'pack-es-v1' }, { tag_name: 'pack-th-v2' }, { tag_name: 'pack-th-v3' }])],
      [manifestUrl, JSON.stringify(release)],
    ]);
    mock.__setDownload(zipUrl, zip);

    const result = await installLanguagePack('th', {
      deps: { fetch: fakeFetch(responses, calls), extractor: fakeExtractor(release), config: { repo: 'OWNER/REPO', baseUrlOverride: null } },
    });

    expect(result.version).toBe(3);
    expect(calls.map((call) => call.url)).toEqual([api, manifestUrl]);
    expect((await activePack('th'))?.version).toBe(3);
  });
});

describe('latestPackRelease (Größe für den Laden-Knopf)', () => {
  test('liefert neueste Version und Zip-Größe aus den GitHub-Releases', async () => {
    const config: PackConfig = { repo: 'nutzer/packs', baseUrlOverride: null };
    const fetchImpl = fakeFetch(new Map([
      ['https://api.github.com/repos/nutzer/packs/releases?per_page=100', JSON.stringify([
        { tag_name: 'pack-th-v1' }, { tag_name: 'pack-th-v3' }, { tag_name: 'pack-es-v9' }, { tag_name: 'v1.0.0' },
      ])],
      ['https://github.com/nutzer/packs/releases/download/pack-th-v3/thai-pack-th-v3.manifest.json', JSON.stringify(releaseFixture(3, 98_000_000))],
    ]));
    await expect(latestPackRelease('th', { fetch: fetchImpl, config })).resolves.toEqual({ version: 3, zipBytes: 98_000_000 });
  });

  test('ohne Release für die Sprache: null', async () => {
    const config: PackConfig = { repo: 'nutzer/packs', baseUrlOverride: null };
    const fetchImpl = fakeFetch(new Map([['https://api.github.com/repos/nutzer/packs/releases?per_page=100', '[]']]));
    await expect(latestPackRelease('th', { fetch: fetchImpl, config })).resolves.toBeNull();
  });

  test('Netzfehler wirft (die Oberfläche bleibt dann still)', async () => {
    await expect(latestPackRelease('th', { fetch: fakeFetch(new Map()), config: OVERRIDE_CONFIG })).rejects.toThrow();
  });
});
