import {
  manifestProblem,
  isPackLanguage,
  validatePackManifest,
  type PackManifest,
} from './manifest';

/**
 * Ein gueltiges Manifest als Ausgangspunkt; die Tests verdrehen jeweils
 * ein Feld und erwarten eine verstaendliche Ablehnung.
 */
function validManifest(overrides: Partial<PackManifest> = {}): PackManifest {
  return {
    schemaVersion: 1,
    language: 'th',
    version: 3,
    createdAt: '2026-09-09T00:00:00.000Z',
    sourceCatalogSha256: 'a'.repeat(64),
    files: [
      { path: 'audio/aa.mp3', sha256: 'b'.repeat(64), bytes: 10 },
      { path: 'images/aahaan.webp', sha256: 'c'.repeat(64), bytes: 5 },
    ],
    totals: { audio: 1, images: 1, bytes: 15 },
    ...overrides,
  };
}

describe('isPackLanguage', () => {
  test('accepts the learning languages only', () => {
    for (const language of ['th', 'en', 'es', 'de', 'fr', 'pt', 'it', 'zh']) {
      expect(isPackLanguage(language)).toBe(true);
    }
    expect(isPackLanguage('ar')).toBe(false);
    expect(isPackLanguage('TH')).toBe(false);
    expect(isPackLanguage(1)).toBe(false);
  });
});

describe('manifestProblem', () => {
  test('accepts a fully valid manifest', () => {
    expect(manifestProblem(validManifest())).toBeNull();
  });

  test.each([
    ['schemaVersion', { schemaVersion: 2 }],
    ['language', { language: 'ar' }],
    ['version', { version: 0 }],
    ['createdAt', { createdAt: 'neulich' }],
    ['sourceCatalogSha256', { sourceCatalogSha256: 'kurz' }],
    ['files leer', { files: [] }],
  ])('rejects broken %s', (_label, overrides) => {
    expect(manifestProblem(validManifest(overrides as Partial<PackManifest>))).not.toBeNull();
  });

  test('rejects path traversal and unsorted files', () => {
    expect(manifestProblem(validManifest({
      files: [{ path: '../escape.mp3', sha256: 'b'.repeat(64), bytes: 10 }],
      totals: { audio: 1, images: 0, bytes: 10 },
    }))).toMatch('Unzulaessiger Dateipfad');
    expect(manifestProblem(validManifest({
      files: [
        { path: 'audio/bb.mp3', sha256: 'b'.repeat(64), bytes: 10 },
        { path: 'audio/aa.mp3', sha256: 'b'.repeat(64), bytes: 10 },
      ],
      totals: { audio: 2, images: 0, bytes: 20 },
    }))).toMatch('nicht aufsteigend sortiert');
  });

  test('rejects totals.bytes that do not match the file sum', () => {
    expect(manifestProblem(validManifest({ totals: { audio: 1, images: 1, bytes: 99 } })))
      .toMatch('passt nicht zur Summe');
  });
});

describe('validatePackManifest', () => {
  test('returns the manifest when it matches the expectation', () => {
    const manifest = validatePackManifest(validManifest(), { language: 'th', version: 3 });
    expect(manifest.version).toBe(3);
  });

  test('throws when language or version differ from the request', () => {
    expect(() => validatePackManifest(validManifest(), { language: 'es' })).toThrow('th');
    expect(() => validatePackManifest(validManifest(), { version: 9 })).toThrow('Version 3');
  });

  test('throws with a readable reason on broken manifests', () => {
    expect(() => validatePackManifest({ schemaVersion: 99 })).toThrow('schemaVersion');
  });
});
