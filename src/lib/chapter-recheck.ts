import type { PairDirection } from './languages/types';
import { finishChapter, type LearningChapter } from './learning-path';
import { readMeta, writeMeta } from './repository';
import type { DataStore } from './storage';

/**
 * Der Nachtest (08.11.2026): Ein bestandenes Kapitel wird nach drei Wochen
 * noch einmal geprüft, danach in wachsenden Abständen. Erst wer den Nachtest
 * besteht, hat ein Kapitel, das „sitzt“ — vorher galt ein Kapitel für immer
 * als erledigt, auch wenn es längst vergessen war. Zielgruppe sind auch
 * Lernende, die nicht verlernen wollen.
 *
 * Gespeichert wie der Kapitelabschluss nur auf diesem Gerät (`meta`). FSRS
 * und die Karten bleiben unberührt.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Abstände nach dem Bestehen: drei Wochen, dann wachsend. */
export const RECHECK_DAYS = [21, 60, 120, 240] as const;
/** Ein nicht bestandener Nachtest kommt so bald wieder. */
export const RETRY_DAYS = 3;

export type CheckRecord = {
  /** Wann das Kapitel zuerst bestanden (oder ohne Check abgeschlossen) wurde. */
  passedAt: number;
  /** Bestandene Nachtests. */
  rechecks: number;
  /** Wann der nächste Nachtest fällig ist. */
  recheckAt: number;
  /** Der letzte Nachtest ist bestanden — das Kapitel „sitzt“. */
  secured: boolean;
};

/** Erster Durchgang, fälliger Nachtest oder Übung ohne Folgen. */
export type CheckKind = 'first' | 'recheck' | 'practice';

function recordKey(direction: PairDirection, chapterId: string): string {
  return `learning-chapter-check:${direction}:${chapterId}`;
}

function isRecord(value: unknown): value is CheckRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.passedAt === 'number'
    && typeof record.rechecks === 'number'
    && typeof record.recheckAt === 'number'
    && typeof record.secured === 'boolean';
}

export function firstRecord(now: number): CheckRecord {
  return { passedAt: now, rechecks: 0, recheckAt: now + RECHECK_DAYS[0] * DAY, secured: false };
}

/**
 * Ist der Nachtest eines Kapitels fällig? Kapitel, die vor dem Nachtest
 * abgeschlossen wurden, haben keinen Eintrag — ihr Nachtest ist gleich dran.
 */
export function recheckDue(finished: boolean, record: CheckRecord | null | undefined, now: number): boolean {
  if (!finished) return false;
  return !record || now >= record.recheckAt;
}

export function checkKind(finished: boolean, record: CheckRecord | null | undefined, now: number): CheckKind {
  if (!finished) return 'first';
  return recheckDue(finished, record, now) ? 'recheck' : 'practice';
}

/** Ganze Tage bis zum nächsten Nachtest, mindestens 1. */
export function daysUntilRecheck(record: CheckRecord, now: number): number {
  return Math.max(1, Math.ceil((record.recheckAt - now) / DAY));
}

/** Der Stand nach einem Durchgang; `null`, wenn es (noch) keinen gibt. */
export function nextRecord(
  kind: CheckKind,
  previous: CheckRecord | null,
  passed: boolean,
  now: number
): CheckRecord | null {
  if (kind === 'practice') return previous;
  if (kind === 'first') return passed ? firstRecord(now) : previous;
  const base = previous ?? { ...firstRecord(now), recheckAt: now };
  if (!passed) return { ...base, secured: false, recheckAt: now + RETRY_DAYS * DAY };
  const rechecks = base.rechecks + 1;
  const days = RECHECK_DAYS[Math.min(rechecks, RECHECK_DAYS.length - 1)];
  return { ...base, rechecks, secured: true, recheckAt: now + days * DAY };
}

export async function loadCheckRecords(
  direction: PairDirection,
  chapterIds: readonly string[],
  store?: DataStore
): Promise<Record<string, CheckRecord>> {
  const values = await Promise.all(
    chapterIds.map((id) => readMeta<unknown>(recordKey(direction, id), null, store))
  );
  return Object.fromEntries(
    chapterIds.flatMap((id, index) => (isRecord(values[index]) ? [[id, values[index]]] : []))
  );
}

async function loadRecord(direction: PairDirection, chapterId: string, store?: DataStore): Promise<CheckRecord | null> {
  const value = await readMeta<unknown>(recordKey(direction, chapterId), null, store);
  return isRecord(value) ? value : null;
}

/**
 * Speichert das Ergebnis eines Checks. Der erste bestandene Check schließt
 * das Kapitel ab; ein Übungsdurchgang ändert nichts.
 */
export async function saveCheckResult(
  direction: PairDirection,
  chapterId: string,
  kind: CheckKind,
  passed: boolean,
  now: number,
  store?: DataStore
): Promise<CheckRecord | null> {
  const previous = await loadRecord(direction, chapterId, store);
  const next = nextRecord(kind, previous, passed, now);
  if (kind === 'first' && passed) await finishChapter(direction, chapterId, store);
  if (next && next !== previous) await writeMeta(recordKey(direction, chapterId), next, store);
  return next;
}

/** „Ohne Check abschließen“: Der Nachtest kommt trotzdem nach drei Wochen. */
export async function scheduleFirstRecheck(
  direction: PairDirection,
  chapterId: string,
  now: number,
  store?: DataStore
): Promise<CheckRecord> {
  const previous = await loadRecord(direction, chapterId, store);
  if (previous) return previous;
  const record = firstRecord(now);
  await writeMeta(recordKey(direction, chapterId), record, store);
  return record;
}

/** Das Kapitel, dessen Nachtest am längsten fällig ist, oder `null`. */
export function dueRecheck(
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  records: Readonly<Record<string, CheckRecord>>,
  now: number
): LearningChapter | null {
  const due = chapters.filter((chapter) => recheckDue(finished.includes(chapter.id), records[chapter.id], now));
  due.sort((a, b) => (records[a.id]?.recheckAt ?? 0) - (records[b.id]?.recheckAt ?? 0));
  return due[0] ?? null;
}
