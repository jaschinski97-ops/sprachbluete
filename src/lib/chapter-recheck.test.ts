import {
  checkKind,
  daysUntilRecheck,
  dueRecheck,
  firstRecord,
  loadCheckRecords,
  nextRecord,
  RECHECK_DAYS,
  recheckDue,
  RETRY_DAYS,
  saveCheckResult,
  scheduleFirstRecheck,
  type CheckRecord,
} from './chapter-recheck';
import type { ConversationSituation } from './conversation/types';
import { finishedChapterIds, type LearningChapter } from './learning-path';
import { MemoryDataStore } from './storage';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 8);

async function freshStore() {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

const chapter = (id: string): LearningChapter => ({
  id,
  situation: { id, topic: 'greeting', level: 'A1' } as ConversationSituation,
  vocabulary: [],
});

test('der erste bestandene Check plant den Nachtest in drei Wochen', () => {
  expect(nextRecord('first', null, true, T0)).toEqual({
    passedAt: T0, rechecks: 0, recheckAt: T0 + RECHECK_DAYS[0] * DAY, secured: false,
  });
  // Nicht bestanden: nichts gespeichert.
  expect(nextRecord('first', null, false, T0)).toBeNull();
});

test('ein bestandener Nachtest sichert das Kapitel und verlängert den Abstand', () => {
  const first = firstRecord(T0);
  const later = first.recheckAt;
  const one = nextRecord('recheck', first, true, later);
  expect(one).toMatchObject({ rechecks: 1, secured: true, recheckAt: later + RECHECK_DAYS[1] * DAY, passedAt: T0 });
  const two = nextRecord('recheck', one, true, one!.recheckAt);
  expect(two).toMatchObject({ rechecks: 2, secured: true, recheckAt: one!.recheckAt + RECHECK_DAYS[2] * DAY });
  // Der längste Abstand bleibt danach gleich.
  const many = nextRecord('recheck', { ...first, rechecks: 10 }, true, T0);
  expect(many?.recheckAt).toBe(T0 + RECHECK_DAYS[RECHECK_DAYS.length - 1] * DAY);
});

test('ein nicht bestandener Nachtest nimmt „sitzt“ zurück und kommt bald wieder', () => {
  const secured: CheckRecord = { passedAt: T0, rechecks: 2, recheckAt: T0, secured: true };
  expect(nextRecord('recheck', secured, false, T0)).toEqual({
    ...secured, secured: false, recheckAt: T0 + RETRY_DAYS * DAY,
  });
});

test('ein Übungsdurchgang ändert nichts', () => {
  const record = firstRecord(T0);
  expect(nextRecord('practice', record, true, T0)).toBe(record);
  expect(nextRecord('practice', record, false, T0)).toBe(record);
});

test('alte Abschlüsse ohne Eintrag haben ihren Nachtest gleich', () => {
  expect(recheckDue(true, null, T0)).toBe(true);
  expect(recheckDue(false, null, T0)).toBe(false);
  const record = firstRecord(T0);
  expect(recheckDue(true, record, T0 + DAY)).toBe(false);
  expect(recheckDue(true, record, record.recheckAt)).toBe(true);
  expect(checkKind(false, null, T0)).toBe('first');
  expect(checkKind(true, null, T0)).toBe('recheck');
  expect(checkKind(true, record, T0 + DAY)).toBe('practice');
  expect(daysUntilRecheck(record, T0)).toBe(RECHECK_DAYS[0]);
  expect(daysUntilRecheck(record, record.recheckAt + DAY)).toBe(1);
});

test('der am längsten fällige Nachtest kommt zuerst', () => {
  const chapters = [chapter('a'), chapter('b'), chapter('c'), chapter('d')];
  const records: Record<string, CheckRecord> = {
    a: { ...firstRecord(T0), recheckAt: T0 + 5 * DAY },
    b: { ...firstRecord(T0), recheckAt: T0 + 2 * DAY },
    c: { ...firstRecord(T0), recheckAt: T0 + 50 * DAY },
  };
  const now = T0 + 10 * DAY;
  // d ist abgeschlossen, hat aber keinen Eintrag: am längsten fällig.
  expect(dueRecheck(chapters, ['a', 'b', 'c', 'd'], records, now)?.id).toBe('d');
  expect(dueRecheck(chapters, ['a', 'b', 'c'], records, now)?.id).toBe('b');
  expect(dueRecheck(chapters, ['c'], records, now)).toBeNull();
});

test('speichern: der erste Check schließt ab, Übung schreibt nichts', async () => {
  const store = await freshStore();
  expect(await saveCheckResult('de_to_en', 'a', 'first', false, T0, store)).toBeNull();
  expect(await finishedChapterIds('de_to_en', [chapter('a')], store)).toEqual([]);

  const first = await saveCheckResult('de_to_en', 'a', 'first', true, T0, store);
  expect(first).toEqual(firstRecord(T0));
  expect(await finishedChapterIds('de_to_en', [chapter('a')], store)).toEqual(['a']);

  await saveCheckResult('de_to_en', 'a', 'practice', false, T0 + DAY, store);
  expect(await loadCheckRecords('de_to_en', ['a', 'b'], store)).toEqual({ a: first });

  const recheck = await saveCheckResult('de_to_en', 'a', 'recheck', true, first!.recheckAt, store);
  expect(recheck).toMatchObject({ secured: true, rechecks: 1 });
  expect((await loadCheckRecords('de_to_en', ['a'], store)).a).toEqual(recheck);
  // Andere Richtung, eigener Stand.
  expect(await loadCheckRecords('en_to_de', ['a'], store)).toEqual({});
});

test('„ohne Check abschließen“ plant den Nachtest, überschreibt aber keinen Stand', async () => {
  const store = await freshStore();
  expect(await scheduleFirstRecheck('de_to_en', 'a', T0, store)).toEqual(firstRecord(T0));
  expect(await scheduleFirstRecheck('de_to_en', 'a', T0 + 9 * DAY, store)).toEqual(firstRecord(T0));
});
