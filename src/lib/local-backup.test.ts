import { BackupError } from './backup';
import {
  BEFORE_RESTORE_FILE,
  dayFileName,
  listLocalBackups,
  LOCAL_BACKUP_DAYS,
  restoreLocalBackup,
  writeLocalBackup,
  type LocalBackupFiles,
} from './local-backup';
import { loadAllCardStates } from './repository';
import { MemoryDataStore } from './storage';
import type { FSRSCardState } from './fsrs/types';

// Die nativen Arme (Ordner in `Paths.document`) laufen erst auf dem Gerät;
// hier zählt die Logik über eine Ablage im Speicher.
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 10, 8, 12).getTime();

function memoryFiles(keep = LOCAL_BACKUP_DAYS): LocalBackupFiles & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    keep,
    list: async () => [...data.keys()],
    read: async (name) => data.get(name) ?? null,
    write: async (name, text) => {
      data.set(name, text);
    },
    remove: async (name) => {
      data.delete(name);
    },
  };
}

async function freshStore() {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function card(vocabId: string, reps = 1): FSRSCardState {
  return {
    vocabId, direction: 'de_to_es', state: 'review', difficulty: 5, stability: 10,
    due: T0, lastReview: T0 - DAY, reps, lapses: 0,
  };
}

test('ein leerer Lernstand wird nicht geschrieben', async () => {
  const files = memoryFiles();
  expect(await writeLocalBackup({ store: await freshStore(), files, now: T0 })).toBe('empty');
  expect(files.data.size).toBe(0);
});

test('eine Datei je Tag, die ältesten fallen weg', async () => {
  const store = await freshStore();
  await store.put('cards', 'a:de_to_es', card('a'));
  const files = memoryFiles(3);
  for (let day = 0; day < 5; day++) {
    expect(await writeLocalBackup({ store, files, now: T0 + day * DAY })).toBe('written');
  }
  // Zweimal am selben Tag ersetzt die Tagesdatei.
  await writeLocalBackup({ store, files, now: T0 + 4 * DAY + 1000 });
  const list = await listLocalBackups(files);
  expect(list.map((backup) => backup.name)).toEqual([
    dayFileName(T0 + 4 * DAY), dayFileName(T0 + 3 * DAY), dayFileName(T0 + 2 * DAY),
  ]);
  expect(list[0].day).toBe('2026-11-12');
});

test('Zurückholen legt den Stand davor ab und lässt sich zurücknehmen', async () => {
  const store = await freshStore();
  const files = memoryFiles();
  await store.put('cards', 'a:de_to_es', card('a'));
  await store.put('meta', 'learning-chapter:de_to_es:x', true);
  await writeLocalBackup({ store, files, now: T0 });

  // Später: mehr gelernt, ein Kapitel mehr.
  await store.put('cards', 'b:de_to_es', card('b'));
  await store.put('meta', 'learning-chapter:de_to_es:y', true);

  const summary = await restoreLocalBackup(dayFileName(T0), { store, files, now: T0 + DAY });
  expect(summary).toMatchObject({ cards: 1, chapters: 1 });
  expect((await loadAllCardStates(store)).map((entry) => entry.vocabId)).toEqual(['a']);
  expect(await store.get('meta', 'learning-chapter:de_to_es:y')).toBeNull();

  const list = await listLocalBackups(files);
  expect(list[list.length - 1]).toEqual({ name: BEFORE_RESTORE_FILE, day: null });

  // Zurücknehmen bringt den späteren Stand wieder.
  await restoreLocalBackup(BEFORE_RESTORE_FILE, { store, files, now: T0 + DAY });
  expect((await loadAllCardStates(store)).map((entry) => entry.vocabId).sort()).toEqual(['a', 'b']);
  expect(await store.get('meta', 'learning-chapter:de_to_es:y')).toBe(true);
});

test('eine unbrauchbare Sicherung ändert nichts', async () => {
  const store = await freshStore();
  const files = memoryFiles();
  await store.put('cards', 'a:de_to_es', card('a'));
  files.data.set('sicherung-2026-11-01.json', '{kaputt');
  await expect(restoreLocalBackup('sicherung-2026-11-01.json', { store, files })).rejects.toBeInstanceOf(BackupError);
  await expect(restoreLocalBackup('fehlt.json', { store, files })).rejects.toBeInstanceOf(BackupError);
  expect(await loadAllCardStates(store)).toHaveLength(1);
  expect(files.data.has(BEFORE_RESTORE_FILE)).toBe(false);
});

test('fremde Dateien im Ordner werden nicht angezeigt', async () => {
  const files = memoryFiles();
  files.data.set('notiz.txt', 'x');
  files.data.set('sicherung-2026-11-01.json', '{}');
  expect(await listLocalBackups(files)).toEqual([{ name: 'sicherung-2026-11-01.json', day: '2026-11-01' }]);
});
