/**
 * Der Oberflächen-Zustand der Sprachpakete: Abfrage nur einmal je App-Start,
 * Fortschritt während des Downloads, Fehler ohne Absturz.
 */
import { act, create } from 'react-test-renderer';

import { installLanguagePack, latestPackRelease } from './downloader';
import { activePack } from './store';
import {
  downloadPack,
  megabytes,
  refreshPack,
  resetPackState,
  updateAvailable,
  usePackStatus,
  type PackStatus,
} from './state';

jest.mock('../content/bundled', () => ({ mediaFromPacks: () => true }));
jest.mock('./store', () => ({ activePack: jest.fn() }));
jest.mock('./downloader', () => ({
  installLanguagePack: jest.fn(),
  latestPackRelease: jest.fn(),
  uninstallLanguagePack: jest.fn(),
}));

const mockActive = activePack as jest.MockedFunction<typeof activePack>;
const mockLatest = latestPackRelease as jest.MockedFunction<typeof latestPackRelease>;
const mockInstall = installLanguagePack as jest.MockedFunction<typeof installLanguagePack>;

// Den Zustand ohne Komponente lesen: usePackStatus nutzt useSyncExternalStore,
// der Snapshot-Getter ist derselbe — hier über einen minimalen Render.
function lies(language: 'th'): PackStatus {
  let wert: PackStatus | null = null;
  function Probe() { wert = usePackStatus(language); return null; }
  act(() => { create(<Probe />); });
  return wert!;
}

beforeEach(() => {
  resetPackState();
  jest.clearAllMocks();
});

test('refreshPack liest den installierten Stand und fragt die neueste Version nur einmal ab', async () => {
  mockActive.mockResolvedValue({ language: 'th', version: 2 } as never);
  mockLatest.mockResolvedValue({ version: 3, zipBytes: 98 * 1024 * 1024 });
  await refreshPack('th');
  await refreshPack('th');
  expect(mockLatest).toHaveBeenCalledTimes(1);
  const status = lies('th');
  expect(status.installed).toBe(2);
  expect(status.latest).toEqual({ version: 3, zipBytes: 98 * 1024 * 1024 });
  expect(updateAvailable(status)).toBe(true);
});

test('offline: kein Absturz, die nächste Abfrage versucht es erneut', async () => {
  mockActive.mockResolvedValue(null);
  mockLatest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
  await refreshPack('th');
  expect(lies('th').latest).toBeUndefined();
  await refreshPack('th');
  expect(lies('th').latest).toBeNull();
});

test('downloadPack meldet Fortschritt und danach die installierte Version', async () => {
  const stände: number[] = [];
  mockInstall.mockImplementation(async (_language, options) => {
    options?.onProgress?.({ stage: 'download', language: 'th', version: 1, bytesWritten: 50, totalBytes: 100 });
    stände.push(lies('th').progress);
    options?.onProgress?.({ stage: 'extract', language: 'th', version: 1 });
    stände.push(lies('th').phase === 'installing' ? 1 : -1);
    return { language: 'th', version: 1, uri: 'file:///packs/th/v1', manifest: {} as never };
  });
  await expect(downloadPack('th')).resolves.toBe(true);
  expect(stände).toEqual([0.5, 1]);
  expect(lies('th')).toMatchObject({ installed: 1, phase: 'idle' });
});

test('ein fehlgeschlagener Download landet als Fehler im Zustand', async () => {
  mockInstall.mockRejectedValue(new Error('HTTP 404'));
  await expect(downloadPack('th')).resolves.toBe(false);
  expect(lies('th').phase).toBe('error');
});

test('megabytes rundet für Knöpfe und zeigt nie 0 MB', () => {
  expect(megabytes(98 * 1024 * 1024)).toBe('98 MB');
  expect(megabytes(1000)).toBe('1 MB');
});
