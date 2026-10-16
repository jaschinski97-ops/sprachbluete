import { Platform } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import {
  applyBackupToStore,
  BackupError,
  backupFileName,
  buildBackupDocument,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  chooseBackupFile,
  exportBackup,
  parseBackupText,
  restoreBackup,
  validateBackupDocument,
} from './backup';
import { translate } from './i18n';
import { loadProfile } from './profile';
import { loadAllCardStates } from './repository';
import { loadReviewLog, ReviewDayLog } from './review-log';
import { DataStore, MemoryDataStore } from './storage';
import { FSRSCardState } from './fsrs/types';

/**
 * Reine Logik (Aufbauen, Prüfen, Ersetzen) läuft gegen den Memory-Store wie
 * profile.test.ts; die Plattform-Arme (Sharing, Picker, Dateisystem) sind
 * gemockt — ein nativer Lauf braucht einen Dev-Client-Rebuild, weil
 * expo-sharing/expo-document-picker neue native Module sind.
 */

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('expo-file-system', () => {
  // Was der Fake geschrieben hat, je URI — so kann der Export-Schrieb des
  // Exports vom Import-Lesen desselben Fakes geprüft werden.
  const mockWrittenFiles = new Map<string, string>();
  class MockFile {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      const segments = parts.map((part) =>
        typeof part === 'string' ? part : ((part as { uri?: string })?.uri ?? '')
      );
      this.uri = segments.filter((segment) => segment.length > 0).join('/');
    }

    get exists(): boolean {
      return mockWrittenFiles.has(this.uri);
    }

    create(): void {
      if (!mockWrittenFiles.has(this.uri)) mockWrittenFiles.set(this.uri, '');
    }

    write(content: string): void {
      mockWrittenFiles.set(this.uri, content);
    }

    text(): Promise<string> {
      return Promise.resolve(mockWrittenFiles.get(this.uri) ?? '');
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///mock-cache' } } };
});

const REAL_PLATFORM_OS = Platform.OS;

// @types/jest (29.5) deklariert jest.stubGlobal nicht — also werden die
// Web-Globals für den Download-Test von Hand gesetzt und zurückgestellt.
const savedGlobals: Array<{ name: string; value: unknown }> = [];

function stubGlobalProperty(name: 'document' | 'URL', value: unknown): void {
  const holder = globalThis as Record<string, unknown>;
  savedGlobals.push({ name, value: holder[name] });
  holder[name] = value;
}

afterEach(() => {
  Platform.OS = REAL_PLATFORM_OS;
  while (savedGlobals.length > 0) {
    const { name, value } = savedGlobals.pop()!;
    (globalThis as Record<string, unknown>)[name] = value;
  }
  jest.clearAllMocks();
});

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

/** Grund der Ablehnung — schlägt fehl, wenn das Dokument doch gültig war. */
function reasonOf(raw: unknown): string {
  const result = validateBackupDocument(raw);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Dokument war unerwartet gültig.');
  return result.reason;
}

/* ---------- Datenfabriken ---------- */

function makeCard(overrides: Partial<FSRSCardState> = {}): FSRSCardState {
  return {
    vocabId: 'w1',
    direction: 'de_to_th',
    state: 'learning',
    difficulty: 5,
    stability: 2.5,
    due: 1_700_000_000_000,
    lastReview: 1_699_999_000_000,
    reps: 3,
    lapses: 1,
    ...overrides,
  };
}

function makeDay(overrides: Partial<ReviewDayLog> = {}): ReviewDayLog {
  return {
    date: '2026-09-01',
    total: 7,
    byDirection: { de_to_th: 4, th_to_de: 3 },
    byRating: { '1': 1, '2': 1, '3': 3, '4': 2 },
    drills: 2,
    drillsCorrect: 1,
    ...overrides,
  };
}

function validDocument(now = 1_760_000_000_000): ReturnType<typeof JSON.parse> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: {
      cards: [makeCard(), makeCard({ vocabId: 'w2', direction: 'th_to_de' })],
      reviewLog: [makeDay(), makeDay({ date: '2026-09-02', total: 0 })],
      profile: {
        language: 'th',
        review: { direction: 'de_to_th', mode: 'cards' },
        conversation: 'th_to_de',
      },
    },
  };
}

/* ---------- Aufbauen (Export) ---------- */

describe('buildBackupDocument', () => {
  it('sammelt Karten, Protokoll und Profil über die bestehenden Reader', async () => {
    const store = await freshStore();
    const now = 1_760_000_000_000;
    await store.putMany('cards', [
      { id: 'w1:de_to_th', value: makeCard() },
      { id: 'w2:th_to_de', value: makeCard({ vocabId: 'w2', direction: 'th_to_de' }) },
    ]);
    await store.put('reviewLog', '2026-09-01', makeDay());
    await store.put('meta', 'profile', {
      language: 'th',
      review: null,
      conversation: 'de_to_th',
    });

    const doc = await buildBackupDocument(store, now);

    expect(doc.format).toBe(BACKUP_FORMAT);
    expect(doc.version).toBe(BACKUP_VERSION);
    expect(doc.exportedAt).toBe(new Date(now).toISOString());
    expect(doc.data.cards).toHaveLength(2);
    expect(doc.data.reviewLog).toHaveLength(1);
    expect(doc.data.profile).toEqual({
      language: 'th',
      review: null,
      conversation: 'de_to_th',
    });
  });
});

describe('backupFileName', () => {
  it('trägt das lokale Datum des Sicherungszeitpunkts', () => {
    // Mittags lokal: egal in welcher Zeitzone der Rechner testet, der Tag
    // bleibt 2026-09-07 (bei Mitternachts-Grenzfällen wäre UTC falsch).
    const noon = new Date('2026-09-07T12:00:00').getTime();
    expect(backupFileName(noon)).toBe('thaispeaker-backup-2026-09-07.json');
  });
});

/* ---------- Prüfen ---------- */

describe('validateBackupDocument', () => {
  it('akzeptiert ein vollständiges Dokument', () => {
    const result = validateBackupDocument(validDocument());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cards).toHaveLength(2);
      expect(result.data.reviewLog).toHaveLength(2);
      expect(result.data.profile?.language).toBe('th');
    }
  });

  it('nimmt ein Dokument ohne Profil an und behandelt es als „Profil nicht vorhanden“', () => {
    const doc = validDocument();
    delete doc.data.profile;
    const result = validateBackupDocument(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.profile).toBeNull();
  });

  it('lehnt keine Objekte, Fremdformate und unbrauchbare Versionen ab', () => {
    expect(validateBackupDocument(null).ok).toBe(false);
    expect(validateBackupDocument('text').ok).toBe(false);
    expect(validateBackupDocument([1, 2]).ok).toBe(false);

    const fremd = validDocument();
    fremd.format = 'irgendwas-anderes';
    expect(reasonOf(fremd)).toMatch(/keine Sicherung/);

    const kaputteVersion = validDocument();
    kaputteVersion.version = 'eins';
    expect(reasonOf(kaputteVersion)).toMatch(/Format-Version/);
  });

  it('lehnt Sicherungen künftiger Formate ab', () => {
    const zukunft = validDocument();
    zukunft.version = BACKUP_VERSION + 1;
    const result = validateBackupDocument(zukunft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/neueren App-Version/);
  });

  it('lehnt beschädigte Kartenzustände ab und nennt den Eintrag', () => {
    const doc = validDocument();
    doc.data.cards[1].state = 'fertig';
    const result = validateBackupDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Kartenzustände.*Eintrag 2/);
  });

  it('lehnt unbekannte Richtungen in Karten ab', () => {
    const doc = validDocument();
    // SEIT STUFE 1 GÜLTIG, NICHT MEHR UNBEKANNT: `th_to_en` ist eine der
    // sechs Kreuzrichtungen und trägt eigene Karten — der Import muss sie
    // akzeptieren, sonst verlöre eine Sicherung den Kreuz-Lernstand. Abge-
    // lehnt wird weiter, was kein Kanon-Paar ist (hier: Französisch, seit
    // dem Kern-4-Entscheid entfernt, und das Selbstpaar).
    doc.data.cards[0].direction = 'th_to_fr';
    expect(validateBackupDocument(doc).ok).toBe(false);
    doc.data.cards[0].direction = 'en_to_es';
    expect(validateBackupDocument(doc).ok).toBe(true);
    // SEIT DEM AR-PILOTEN Ebenso: ar_to_* trägt (auf Geräten mit arabischer
    // Oberfläche) eigene Karten — eine Sicherung ohne sie wäre unvollständig.
    doc.data.cards[0].direction = 'ar_to_th';
    expect(validateBackupDocument(doc).ok).toBe(true);
  });

  it('lehnt beschädigte Protokolltage ab', () => {
    const doc = validDocument();
    doc.data.reviewLog[0].date = '2026-9-1';
    const result = validateBackupDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Lernprotokoll.*Eintrag 1/);
  });

  it('lehnt ein beschädigtes Profil ab', () => {
    const doc = validDocument();
    doc.data.profile.conversation = 'xx_to_de';
    const result = validateBackupDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Lernprofil/);
  });

  it('lehnt einen fehlenden Datenbereich ab', () => {
    const result = validateBackupDocument({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-09-07T00:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Datenbereich/);
  });
});

describe('parseBackupText', () => {
  it('liefert Daten und Zeitpunkt für gültigen Text', () => {
    const { data, exportedAt } = parseBackupText(JSON.stringify(validDocument()));
    expect(data.cards).toHaveLength(2);
    expect(exportedAt).toBe(new Date(1_760_000_000_000).toISOString());
  });

  it('wirft deutschsprachig bei ungültigem JSON', () => {
    expect(() => parseBackupText('{kein json')).toThrow(/keine gültige JSON/);
  });

  it('wirft bei Überschreitung der Größenbegrenzung', () => {
    expect(() => parseBackupText('x'.repeat(11), 10)).toThrow(/20 MB/);
  });

  it('liefert übersetzbare Fehler statt nur deutschen Text (Testlauf 16.10.2026)', () => {
    const fehler = (() => {
      try {
        parseBackupText(JSON.stringify({ ...validDocument(), version: 99 }));
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(fehler).toBeInstanceOf(BackupError);
    const { key, params } = fehler as BackupError;
    expect(key).toBe('backup.errNewer');
    expect(translate('en', key, params)).toMatch(/newer app version \(format 99/);
    expect(translate('th', key, params)).toContain('99');
  });
});

/* ---------- Anwenden (Import) ---------- */

describe('applyBackupToStore', () => {
  it('ersetzt Karten und Protokoll vollständig — kein Mischen mit Vorhandenem', async () => {
    const store = await freshStore();
    await store.put('cards', 'alt:de_to_th', makeCard({ vocabId: 'alt' }));
    await store.put('reviewLog', '2020-01-01', makeDay({ date: '2020-01-01' }));
    await store.put('meta', 'profile', { language: 'en', review: null, conversation: null });

    const doc = validDocument();
    const summary = await applyBackupToStore(doc.data, store);

    expect(summary.cards).toBe(2);
    expect(summary.logEntries).toBe(2);
    expect(summary.profileApplied).toBe(true);

    const cards = await loadAllCardStates(store);
    expect(cards.map((card) => card.vocabId).sort()).toEqual(['w1', 'w2']);
    const log = await loadReviewLog(store);
    expect(log.map((entry) => entry.date)).toEqual(['2026-09-01', '2026-09-02']);

    // Profil über die öffentlichen Setter: Sprache UND gemerkte Stände.
    const profile = await loadProfile(store);
    expect(profile.language).toBe('th');
    expect(profile.review).toEqual({ direction: 'de_to_th', mode: 'cards' });
    expect(profile.conversation).toBe('th_to_de');
  });

  it('lässt das aktuelle Profil unberührt, wenn die Sicherung keins hat', async () => {
    const store = await freshStore();
    await store.put('meta', 'profile', { language: 'es', review: null, conversation: null });

    const doc = validDocument();
    doc.data.profile = null;
    const summary = await applyBackupToStore(doc.data, store);

    expect(summary.profileApplied).toBe(false);
    expect((await loadProfile(store)).language).toBe('es');
  });

  it('leert die Sammlungen bei einer leeren Sicherung', async () => {
    const store = await freshStore();
    await store.put('cards', 'alt:de_to_th', makeCard({ vocabId: 'alt' }));
    await store.put('reviewLog', '2020-01-01', makeDay({ date: '2020-01-01' }));

    await applyBackupToStore({ cards: [], reviewLog: [], profile: null }, store);

    expect(await loadAllCardStates(store)).toEqual([]);
    expect(await loadReviewLog(store)).toEqual([]);
  });

  it('macht doppelte Schlüssel idempotent — der letzte Eintrag gewinnt', async () => {
    const store = await freshStore();
    const doc = validDocument();
    doc.data.cards = [makeCard({ reps: 1 }), makeCard({ reps: 9 })];

    await applyBackupToStore(doc.data, store);

    const cards = await loadAllCardStates(store);
    expect(cards).toHaveLength(1);
    expect(cards[0].reps).toBe(9);
  });
});

/* ---------- Export-Rampe (nativ, gemockt) ---------- */

describe('exportBackup (nativ)', () => {
  it('schreibt die Datei ins Cache-Verzeichnis und übergibt sie dem Share-Sheet', async () => {
    Platform.OS = 'ios';
    const store = await freshStore();
    await store.put('cards', 'w1:de_to_th', makeCard());
    const now = new Date('2026-09-07T12:00:00').getTime();

    const fileName = await exportBackup({ store, now });

    expect(fileName).toBe('thaispeaker-backup-2026-09-07.json');
    const file = new File(Paths.cache, fileName);
    expect(file.exists).toBe(true);
    const doc = JSON.parse(await file.text());
    expect(doc.format).toBe(BACKUP_FORMAT);
    expect(doc.data.cards).toHaveLength(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///mock-cache/thaispeaker-backup-2026-09-07.json',
      expect.objectContaining({ mimeType: 'application/json' })
    );
  });
});

/* ---------- Export-Rampe (Web, gemockt) ---------- */

describe('exportBackup (Web)', () => {
  it('lädt die Sicherung als Blob über eine Object-URL', async () => {
    Platform.OS = 'web';
    const store = await freshStore();

    const anchor = {
      href: '',
      download: '',
      click: jest.fn(),
      remove: jest.fn(),
    };
    const createObjectURL = jest.fn(() => 'blob:sicherung');
    stubGlobalProperty('document', {
      createElement: () => anchor,
      body: { appendChild: () => undefined },
    });
    stubGlobalProperty('URL', {
      createObjectURL,
      revokeObjectURL: jest.fn(),
    });

    const now = new Date('2026-09-07T12:00:00').getTime();
    const fileName = await exportBackup({ store, now });

    expect(fileName).toBe('thaispeaker-backup-2026-09-07.json');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(anchor.download).toBe(fileName);
    expect(anchor.href).toBe('blob:sicherung');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

/* ---------- Import-Rampe (gemockt) ---------- */

describe('chooseBackupFile / restoreBackup', () => {
  it('meldet Abbrechen als null', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: null,
    });
    expect(await chooseBackupFile()).toBeNull();
  });

  it('liest die gewählte Datei, prüft sie und ersetzt die Historie', async () => {
    const store = await freshStore();
    await store.put('cards', 'alt:de_to_th', makeCard({ vocabId: 'alt' }));

    const asset = {
      name: 'thaispeaker-backup-2026-09-07.json',
      uri: 'file:///gewaehlt/sicherung.json',
      size: 400,
      lastModified: 0,
    };
    new File(asset.uri).write(JSON.stringify(validDocument()));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [asset],
    });

    const picked = await chooseBackupFile();
    expect(picked).toEqual(asset);

    const summary = await restoreBackup(picked!, store);
    expect(summary.cards).toBe(2);
    expect(summary.exportedAt).toBe(new Date(1_760_000_000_000).toISOString());
    expect((await loadAllCardStates(store)).map((card) => card.vocabId).sort()).toEqual([
      'w1',
      'w2',
    ]);
  });

  it('lehnt übergroße Dateien vor dem Lesen ab', async () => {
    const asset = {
      name: 'riesig.json',
      uri: 'file:///gewaehlt/riesig.json',
      size: 21 * 1024 * 1024,
      lastModified: 0,
    };
    await expect(restoreBackup(asset)).rejects.toThrow(/20 MB/);
  });

  it('gibt einer unbrauchbaren Datei eine deutschsprachige Meldung', async () => {
    const asset = {
      name: 'fremd.json',
      uri: 'file:///gewaehlt/fremd.json',
      size: 100,
      lastModified: 0,
    };
    new File(asset.uri).write('{"format": "was-auch-immer"}');
    await expect(restoreBackup(asset)).rejects.toThrow(/keine Sicherung/);
  });
});
