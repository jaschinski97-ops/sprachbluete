import { exportDrafts, stableStringify, startAutomaticDelivery } from './content-client';
import { currentCatalog, setCurrentCatalog } from '@/lib/content/catalog-state';
import type { ContentEntry } from '@/lib/content/types';

const mockGetAll = jest.fn();
const mockPut = jest.fn();
const mockAudioUri = jest.fn(async (_key?: string): Promise<string | null> => null);
jest.mock('@/lib/storage', () => ({ getStore: async () => ({ getAll: mockGetAll, put: mockPut }) }));
jest.mock('@/lib/content/developer', () => ({ isContentDeveloper: () => true }));
jest.mock('@/lib/clips/blob-store', () => ({ getAudioBlobStore: async () => ({ uri: mockAudioUri }) }));
const mockImageUri = jest.fn(async () => null as string | null);
jest.mock('@/lib/images/blob-store', () => ({ getImageBlobStore: async () => ({ uri: mockImageUri }) }));

test('delivery overlaps the next producer, serializes simultaneous audio workers and becomes live after acknowledgement', async () => {
  const originalFetch = global.fetch;
  const originalCatalog = currentCatalog();
  setCurrentCatalog({ version: 2, entries: [] });
  const releases: (() => void)[] = [];
  const ids: string[] = [];
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/delivery/start')) return { ok: true, json: async () => ({ token: 'run' }) } as Response;
    if (String(url).endsWith('/delivery/item')) {
      const payload = JSON.parse(options!.body as string);
      ids.push(payload.document.id);
      await new Promise<void>(resolve => releases.push(resolve));
      return { ok: true, json: async () => ({ kind: payload.kind, id: payload.document.id, document: payload.document }) } as Response;
    }
    return { ok: true, json: async () => ({ count: 3 }) } as Response;
  });
  const delivery = await startAutomaticDelivery();
  try {
    await delivery.deliver('audio', { id: 'first' });
    expect(ids).toEqual(['first']);
    expect(currentCatalog().entries).toHaveLength(0);
    const second = delivery.deliver('audio', { id: 'second' });
    const third = delivery.deliver('audio', { id: 'third' });
    releases.shift()!();
    await second;
    expect(ids).toEqual(['first', 'second']);
    expect(currentCatalog().entries.map(e => e.id)).toEqual(['first']);
    releases.shift()!();
    await third;
    expect(ids).toEqual(['first', 'second', 'third']);
    releases.shift()!();
    expect(await delivery.finish()).toBe(3);
    expect(currentCatalog().entries.map((e: ContentEntry) => e.id)).toEqual(ids);
  } finally { await delivery.finish().catch(() => {}); global.fetch = originalFetch; setCurrentCatalog(originalCatalog); }
});

test('failed delivery stops subsequent handoffs and finish still saves earlier acknowledged items', async () => {
  const originalFetch = global.fetch;
  let finishCalled = false;
  global.fetch = jest.fn(async url => {
    if (String(url).endsWith('/delivery/start')) return { ok: true, json: async () => ({ token: 'run' }) } as Response;
    if (String(url).endsWith('/delivery/item')) return { ok: false, json: async () => ({ error: 'disk full' }) } as Response;
    finishCalled = true;
    return { ok: true, json: async () => ({ count: 0 }) } as Response;
  });
  const delivery = await startAutomaticDelivery();
  try {
    await delivery.deliver('images', { id: 'first' }, 'QUJD');
    await expect(delivery.flush()).rejects.toThrow('disk full');
    expect(delivery.failed).toBe(true);
    await expect(delivery.deliver('images', { id: 'second' }, 'QUJD')).rejects.toThrow('disk full');
    await expect(delivery.finish()).rejects.toThrow('disk full');
    expect(finishCalled).toBe(true);
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith('/delivery/item'))).toHaveLength(1);
  } finally { await delivery.finish().catch(() => {}); global.fetch = originalFetch; }
});

test('invalid local records and missing media do not prevent later drafts from exporting', async () => {
  const originalFetch = global.fetch;
  const staged: { kind: string; document: { id: string } }[] = [];
  global.fetch = jest.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      if (String(_url).endsWith('/stage')) staged.push(JSON.parse(options.body as string));
      return { ok: true, json: async () => ({}) } as Response;
    }
    return { ok: true, json: async () => ({ shipped: { version: 2, entries: [] }, stage: { version: 2, entries: [] } }) } as Response;
  });
  mockGetAll.mockImplementation(async (kind: string) => ({
    situations: [null, 4, [], { id: 'denied' }, { id: 'valid-situation' }],
    exam: [null, { id: 'builtin', source: 'builtin' }, { id: 'valid-exam', source: 'generated' }],
    images: [{ id: 'broken-image', blobKey: 123 }],
    audio: [{ id: 'missing-audio', blobKey: 'missing.mp3' }],
  })[kind]);
  const progress = jest.fn();
  try {
    await expect(exportDrafts(progress)).rejects.toThrow('Lokale Mediendatei fehlt');
    expect(staged.map((item) => item.document.id)).toEqual(['denied', 'valid-situation', 'valid-exam']);
    expect(mockPut).not.toHaveBeenCalled();
    const result = progress.mock.calls.at(-1)?.[0];
    expect(result).toContain('3 exportiert · Prüfbericht aktualisiert · 6 Exportfehler');
    expect(result).toContain('exam:(ungültiger Eintrag)');
    expect(result).toContain('images:broken-image: Blob-Schlüssel fehlt.');
    expect(result).toContain('audio:missing-audio: Lokale Mediendatei fehlt.');
  } finally { global.fetch = originalFetch; }
});

test('stableStringify: Feldreihenfolge ist egal, Inhalt zählt', () => {
  expect(stableStringify({ a: 1, b: { y: 2, x: 3 } })).toBe(stableStringify({ b: { x: 3, y: 2 }, a: 1 }));
  expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  expect(stableStringify([1, { b: 2, a: 1 }])).toBe('[1,{"a":1,"b":2}]');
});

test('schlauer Export: unveränderte Stage-Zwillinge werden übersprungen, Neue gesendet (17.09.)', async () => {
  const originalFetch = global.fetch;
  const gesendet: { kind: string; document: { id: string }; base64?: string }[] = [];
  // Der Stage-Zwilling ist inhaltsgleich, aber absichtlich in VERDREHTER
  // Feldreihenfolge gespeichert — der Vergleich darf daran nicht scheitern.
  const bekannterClip = { id: 'en-bekannt', text: 'hello', byteSize: 123, blobKey: 'en-bekannt.mp3' };
  const stageZwilling = { blobKey: 'en-bekannt.mp3', byteSize: 123, text: 'hello', id: 'en-bekannt' };
  global.fetch = jest.fn(async (_url, options) => {
    if (options?.method === 'POST' && String(_url).endsWith('/stage')) {
      gesendet.push(JSON.parse(options.body as string));
      return { ok: true, json: async () => ({}) } as Response;
    }
    if (options?.method === 'POST') return { ok: true, json: async () => ({}) } as Response;
    return { ok: true, json: async () => ({
      shipped: { version: 2, entries: [] },
      stage: { version: 2, entries: [{ kind: 'audio', id: 'en-bekannt', document: stageZwilling }] },
    }) } as Response;
  });
  mockGetAll.mockImplementation(async (kind: string) => ({
    situations: [], exam: [], images: [],
    audio: [bekannterClip, { id: 'en-neu', text: 'world', blobKey: 'en-neu.mp3' }],
  })[kind]);
  // Nur für den NEUEN Clip liegt eine Mediendatei bereit — der bekannte darf
  // gar nicht erst danach gefragt werden (das war der Zeitfresser: das Base64-
  // Audio von Tausenden Bekannten bei jedem Lauf-Ende erneut hochladen).
  mockAudioUri.mockImplementation(async (key?: string) =>
    key === 'en-neu.mp3' ? 'data:audio/mpeg;base64,QUJD' : null);
  const progress = jest.fn();
  try {
    await exportDrafts(progress);
    expect(gesendet.map((item) => item.document.id)).toEqual(['en-neu']);
    expect(gesendet[0].base64).toBe('QUJD');
    const result = progress.mock.calls.at(-1)?.[0];
    expect(result).toContain('1 exportiert · Prüfbericht aktualisiert · 0 Exportfehler');
  } finally {
    global.fetch = originalFetch;
    mockAudioUri.mockReset();
    mockAudioUri.mockImplementation(async () => null);
  }
});

test('local image preview stages only images and never publishes existing stage or touches audio', async () => {
  const originalFetch = global.fetch;
  const urls: string[] = [];
  global.fetch = jest.fn(async (url) => {
    urls.push(String(url));
    return { ok: true, json: async () => ({ shipped: { version: 2, entries: [] }, stage: { version: 2, entries: [] } }) } as Response;
  });
  mockGetAll.mockClear();
  mockGetAll.mockImplementation(async () => [{ id: 'preview', blobKey: 'preview.webp' }]);
  mockImageUri.mockResolvedValue('data:image/webp;base64,UklGRg==');
  const progress = jest.fn();
  try {
    await exportDrafts(progress, { kinds: ['images'], publish: false });
    expect(mockGetAll.mock.calls.map(call => call[0])).toEqual(['images']);
    expect(urls.some(url => url.endsWith('/stage'))).toBe(true);
    expect(urls.some(url => url.endsWith('/publish'))).toBe(false);
    expect(progress.mock.calls.at(-1)?.[0]).toContain('Bildentwürfe im Stage');
  } finally {
    global.fetch = originalFetch;
    mockImageUri.mockReset(); mockImageUri.mockResolvedValue(null);
  }
});
