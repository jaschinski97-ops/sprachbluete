/**
 * In-Memory-Ersatz fuer expo-file-system (SDK-57-Teilmenge), nur fuer Jest.
 *
 * Benutzung:
 *
 *   jest.mock('expo-file-system', () => require('./packs-test-fs').createMock());
 *   const mock = require('expo-file-system') as MockFileSystem;
 *   beforeEach(() => mock.__reset());
 *
 * Implementiert genau die Oberflaeche, die src/lib/packs benutzt:
 * File (uri/exists/size/text/create/write/delete), Directory
 * (uri/exists/create/list/delete), Paths.document und
 * File.createDownloadTask mit On-Progress.
 */

export type MockDownload = Buffer | Error;

export type MockFileSystem = {
  File: typeof MockFile;
  Directory: typeof MockDirectory;
  Paths: { document: MockDirectory };
  createDownloadTask: (url: string, destination: MockFile, options?: MockDownloadTaskOptions) => MockDownloadTask;
  __reset(): void;
  __seedFile(path: string, content: string | Buffer): void;
  __fileAt(path: string): Buffer | undefined;
  __setDownload(url: string, payload: MockDownload): void;
  __downloads(): Map<string, MockDownload>;
};

type MockDownloadTaskOptions = {
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
  signal?: AbortSignal;
};

type MockDownloadTask = {
  downloadAsync(): Promise<MockFile>;
};

const state = {
  files: new Map<string, Buffer>(),
  dirs: new Set<string>(),
  downloads: new Map<string, MockDownload>(),
};

function normalize(uri: string): string {
  return uri.replace(/^file:\/\//, '').replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function parentOf(normalized: string): string {
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '/' : normalized.slice(0, index);
}

function baseName(normalized: string): string {
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function asPath(part: string | MockFile | MockDirectory): string {
  return typeof part === 'string' ? part : part.uri;
}

export class MockFile {
  readonly uri: string;
  constructor(...uris: (string | MockFile | MockDirectory)[]) {
    this.uri = normalize(uris.map(asPath).join('/'));
  }
  /** Wie das Vorbild: Download mit Fortschritt als statische Fabrik. */
  static createDownloadTask(url: string, destination: MockFile, options?: MockDownloadTaskOptions): MockDownloadTask {
    return {
      async downloadAsync() {
        const payload = state.downloads.get(url);
        if (payload instanceof Error) throw payload;
        if (payload === undefined) throw Error(`Kein Test-Download fuer ${url} angemeldet.`);
        // Wie auf dem Geraet (28.10.2026): Der Zielordner muss existieren.
        // Vorher legte das Test-Dateisystem ihn still an; auf dem iPhone
        // scheiterte deshalb der erste Paket-Download, ohne dass ein Test es sah.
        if (!new MockDirectory(parentOf(destination.uri)).exists) {
          throw Error(`Zielordner fehlt: ${parentOf(destination.uri)}`);
        }
        state.files.set(destination.uri, payload);
        options?.onProgress?.({ bytesWritten: payload.length, totalBytes: payload.length });
        return destination;
      },
    };
  }
  get name(): string {
    return baseName(this.uri);
  }
  get exists(): boolean {
    return state.files.has(this.uri);
  }
  get size(): number {
    return state.files.get(this.uri)?.length ?? 0;
  }
  async text(): Promise<string> {
    const content = state.files.get(this.uri);
    if (content === undefined) throw Error(`Datei fehlt (Test-FS): ${this.uri}`);
    return content.toString('utf8');
  }
  create(): void {
    if (!state.files.has(this.uri)) state.files.set(this.uri, Buffer.alloc(0));
    state.dirs.add(parentOf(this.uri));
  }
  write(content: string | Uint8Array): void {
    state.files.set(this.uri, Buffer.from(content));
    state.dirs.add(parentOf(this.uri));
  }
  delete(): void {
    state.files.delete(this.uri);
  }
}

export class MockDirectory {
  readonly uri: string;
  constructor(...uris: (string | MockFile | MockDirectory)[]) {
    this.uri = normalize(uris.map(asPath).join('/'));
  }
  get name(): string {
    return baseName(this.uri);
  }
  get exists(): boolean {
    if (state.dirs.has(this.uri)) return true;
    for (const path of state.files.keys()) {
      if (path === this.uri || path.startsWith(`${this.uri}/`)) return true;
    }
    return false;
  }
  create(_options?: { intermediates?: boolean; idempotent?: boolean }): void {
    state.dirs.add(this.uri);
  }
  list(): (MockFile | MockDirectory)[] {
    const prefix = `${this.uri}/`;
    const seen = new Map<string, MockFile | MockDirectory>();
    for (const path of state.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest) continue;
      if (rest.includes('/')) {
        const child = `${this.uri}/${rest.slice(0, rest.indexOf('/'))}`;
        if (!seen.has(child)) seen.set(child, new MockDirectory(child));
      } else {
        seen.set(path, new MockFile(path));
      }
    }
    for (const path of state.dirs) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest || rest.includes('/')) continue;
      const child = `${this.uri}/${rest}`;
      if (!seen.has(child)) seen.set(child, new MockDirectory(child));
    }
    return [...seen.values()];
  }
  delete(): void {
    for (const path of [...state.files.keys()]) {
      if (path.startsWith(`${this.uri}/`)) state.files.delete(path);
    }
    for (const path of [...state.dirs]) {
      if (path === this.uri || path.startsWith(`${this.uri}/`)) state.dirs.delete(path);
    }
    state.dirs.delete(this.uri);
  }
}

export function createMock(): MockFileSystem {
  const document = new MockDirectory('file:///mock-doc');
  const instance: MockFileSystem = {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document },
    createDownloadTask(url, destination, options) {
      return MockFile.createDownloadTask(url, destination, options);
    },
    __reset() {
      state.files.clear();
      state.dirs.clear();
      state.downloads.clear();
      // Wie ein frisch installiertes iPhone: Den Dokumente-Ordner gibt es,
      // `packs` legt erst die App an (28.10.2026; vorher war er vorab da).
      state.dirs.add('/mock-doc');
    },
    __seedFile(path, content) {
      const normalized = normalize(path);
      state.files.set(normalized, Buffer.from(content));
      state.dirs.add(parentOf(normalized));
    },
    __fileAt(path) {
      return state.files.get(normalize(path));
    },
    __setDownload(url, payload) {
      state.downloads.set(url, payload);
    },
    __downloads() {
      return state.downloads;
    },
  };
  instance.__reset();
  return instance;
}
