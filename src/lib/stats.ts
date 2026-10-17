import { CardState, FSRSCardState } from './fsrs/types';
import {
  dayIsActive,
  dayKey,
  directionDrillKey,
  drillCount,
  lastDays,
  loadReviewLog,
  ReviewDayLog,
} from './review-log';
import { DirectionSummary, ensureCardStates, summarizeAllDirections, summarizeDirection } from './review-session';
import { LanguageCode, PairDirection, isPairDirection } from './languages/types';
import { DataStore, getStore } from './storage';
import type { VocabEntry } from '@/data/vocab-types';

/**
 * Kennzahlen für den Fortschritts-Screen.
 *
 * Zwei Datenquellen mit unterschiedlicher Aussagekraft:
 *
 * - **Kartenzustände und Fälligkeiten** kommen aus `FSRSCardState` und sind
 *   vollständig: jede Karte trägt ihren aktuellen Zustand.
 * - **Wiederholungen und Übungen pro Tag** kommen aus dem Tagesprotokoll und
 *   reichen nur so weit zurück, wie dieses Protokoll existiert (siehe
 *   `loggedSince` und AE-9). Übungen tragen ihre Lernrichtung erst seit dem
 *   Sprach-Umbau (23.09.2026) — ältere Übungen zählen nur sprachübergreifend.
 */

export const CARD_STATE_ORDER: CardState[] = ['new', 'learning', 'review', 'mastered'];

/**
 * Eigenes Fenster für die Lernserie, unabhängig vom Diagrammfenster.
 * Ein Jahr reicht, um jede realistische Serie vollständig zu zählen.
 */
const STREAK_WINDOW_DAYS = 365;

/** Tage der Fälligkeitsvorschau (heute eingeschlossen). */
export const FORECAST_DAYS = 7;

/** Wortschatz-Meilensteine: die ersten N Wörter des Bestands. */
export const MILESTONES = [250, 500, 1000, 2000] as const;

/** Ab so vielen Aufgaben je Übung wird eine Trefferquote gezeigt. */
export const WEAK_AREA_MIN_TOTAL = 3;

export type Treffer = { total: number; correct: number };

/** Trefferquote einer Übungsart im gewählten Lernziel. */
export type WeakArea = Treffer & {
  /** Übungsart: Drill-ID, `dictation` oder `produktion`. */
  art: string;
};

export type Milestone = {
  /** Die ersten `size` Wörter des Bestands. */
  size: number;
  /** Wie viele davon mindestens einmal bewertet wurden. */
  started: number;
  /** Tatsächliche Größe (kleiner als `size`, wenn der Bestand kleiner ist). */
  total: number;
};

export type LearningStats = {
  perDirection: DirectionSummary[];
  cardStates: Record<CardState, number>;
  totalCards: number;
  totalDue: number;
  days: ReviewDayLog[];
  totalReviews: number;
  reviewsToday: number;
  loggedSince: string | null;
  streak: number;
  drillsToday: number;
  totalDrills: number;
  totalDrillsCorrect: number;
  /** Übungen heute über alle Sprachen. */
  accuracyToday: Treffer;
  /** Übungen im Diagrammfenster über alle Sprachen. */
  accuracyWindow: Treffer;
  /** Übungen im Diagrammfenster NUR dieses Lernziels (seit 23.09.2026 erfasst). */
  directionWindow: Treffer;
  /** Übungsarten dieses Lernziels im Fenster, schwächste zuerst. */
  weakAreas: WeakArea[];
  /** Fällige Karten je Tag: Index 0 = heute (inklusive Überfälligem). */
  forecast: { date: string; due: number }[];
  /** Wortschatz-Meilensteine des Lernziels (nur bei einer Richtung). */
  milestones: Milestone[];
};

function emptyStateCounts(): Record<CardState, number> {
  return { new: 0, learning: 0, review: 0, mastered: 0 };
}

/**
 * Aufeinanderfolgende aktive Tage, rückwärts ab heute gezählt.
 *
 * Aktiv ist ein Tag mit mindestens einer Wiederholung ODER einer Übung. Ist
 * heute noch nichts passiert, zählt die Serie ab gestern: Wer morgens die App
 * öffnet, soll nicht "0 Tage" sehen, nur weil der Tag erst angefangen hat.
 */
export function computeStreak(days: ReviewDayLog[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (dayIsActive(days[i])) {
      streak++;
    } else if (i === days.length - 1) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/** Fällige Karten je Tag der nächsten `tage` Tage — Überfälliges zählt zu heute. */
export function dueForecast(
  cards: readonly FSRSCardState[],
  now: number,
  tage: number = FORECAST_DAYS
): { date: string; due: number }[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const tagesAnfang = (offset: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    return d.getTime();
  };
  return Array.from({ length: tage }, (_, offset) => {
    const bis = tagesAnfang(offset + 1);
    const ab = offset === 0 ? -Infinity : tagesAnfang(offset);
    // Neue Karten (nie bewertet) sind keine Wiederholung — sie stehen im
    // Kartenstapel, nicht in der Vorschau.
    const due = cards.filter((card) => card.state !== 'new' && card.due >= ab && card.due < bis).length;
    return { date: dayKey(tagesAnfang(offset)), due };
  });
}

/**
 * Die Trefferquoten je Übungsart eines Lernziels, schwächste zuerst. Nur
 * Übungsarten mit mindestens `WEAK_AREA_MIN_TOTAL` Aufgaben — eine einzige
 * falsche Antwort ist keine Schwäche.
 */
export function weakAreasFor(days: readonly ReviewDayLog[], direction: PairDirection): WeakArea[] {
  const praefix = directionDrillKey(direction, '');
  const summe = new Map<string, Treffer>();
  for (const day of days) {
    for (const [key, value] of Object.entries(day.byDirectionDrill ?? {})) {
      if (!value || !key.startsWith(praefix)) continue;
      const art = key.slice(praefix.length);
      const bisher = summe.get(art) ?? { total: 0, correct: 0 };
      summe.set(art, { total: bisher.total + value.total, correct: bisher.correct + value.correct });
    }
  }
  return [...summe.entries()]
    .map(([art, treffer]) => ({ art, ...treffer }))
    .filter((area) => area.total >= WEAK_AREA_MIN_TOTAL)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total);
}

/** Übungen eines Lernziels im Fenster (Summe über alle Übungsarten). */
function directionTreffer(days: readonly ReviewDayLog[], direction: PairDirection): Treffer {
  const praefix = directionDrillKey(direction, '');
  let total = 0;
  let correct = 0;
  for (const day of days) {
    for (const [key, value] of Object.entries(day.byDirectionDrill ?? {})) {
      if (!value || !key.startsWith(praefix)) continue;
      total += value.total;
      correct += value.correct;
    }
  }
  return { total, correct };
}

/**
 * Meilensteine: die ersten 250/500/1000/2000 Wörter des Bestands in der
 * Reihenfolge ihrer Erzeugung — der Erzeuger schreibt häufige Wörter zuerst,
 * die frühen Wörter sind also der Grundwortschatz.
 */
export function milestonesFor(entries: readonly VocabEntry[], cards: readonly FSRSCardState[]): Milestone[] {
  const begonnen = new Set(cards.filter((card) => card.state !== 'new').map((card) => card.vocabId));
  const reihenfolge = [...entries].sort(
    (a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id)
  );
  return MILESTONES.filter((_, index) => index === 0 || reihenfolge.length > MILESTONES[index - 1]).map((size) => {
    const stufe = reihenfolge.slice(0, size);
    return { size, total: stufe.length, started: stufe.filter((entry) => begonnen.has(entry.id)).length };
  });
}

/**
 * Lädt alle Kennzahlen.
 *
 * `windowDays` bestimmt, wie viele Tage das Diagramm zeigt. Die Lernserie
 * zählt bewusst über ein eigenes, langes Fenster.
 *
 * `language` ist entweder eine Sprache (alle ihre Inhalts-Richtungen) oder
 * genau eine Lernrichtung — der Fortschritts-Reiter übergibt das Lernziel.
 */
export async function loadLearningStats(
  store?: DataStore,
  now: number = Date.now(),
  windowDays = 14,
  language: LanguageCode | PairDirection = 'th'
): Promise<LearningStats> {
  const db = store ?? (await getStore());

  const perDirection = isPairDirection(language)
    ? [await summarizeDirection(language, db, now)]
    : await summarizeAllDirections(language, db, now);

  const cardStates = emptyStateCounts();
  let totalCards = 0;
  const alleKarten: FSRSCardState[] = [];
  let milestones: Milestone[] = [];
  for (const summary of perDirection) {
    const { entries, cards } = await ensureCardStates(summary.direction, db, now);
    totalCards += cards.length;
    alleKarten.push(...cards);
    for (const card of cards) {
      cardStates[card.state] += 1;
    }
    if (perDirection.length === 1) milestones = milestonesFor(entries, cards);
  }

  const log = await loadReviewLog(db);
  const days = lastDays(log, windowDays, now);
  // max, damit ein künftig größer gewähltes Diagrammfenster die Serie nicht
  // hinter dem Streak-Fenster zurücklässt.
  const streakDays = lastDays(log, Math.max(windowDays, STREAK_WINDOW_DAYS), now);
  const todayKey = days[days.length - 1]?.date;
  const today = log.find((entry) => entry.date === todayKey);
  const direction = isPairDirection(language) ? language : null;

  return {
    perDirection,
    cardStates,
    totalCards,
    totalDue: perDirection.reduce((sum, s) => sum + s.due, 0),
    days,
    totalReviews: log.reduce((sum, entry) => sum + entry.total, 0),
    reviewsToday: today?.total ?? 0,
    loggedSince: log.length > 0 ? log[0].date : null,
    streak: computeStreak(streakDays),
    drillsToday: today ? drillCount(today) : 0,
    totalDrills: log.reduce((sum, entry) => sum + drillCount(entry), 0),
    totalDrillsCorrect: log.reduce((sum, entry) => sum + (entry.drillsCorrect ?? 0), 0),
    accuracyToday: { total: today ? drillCount(today) : 0, correct: today?.drillsCorrect ?? 0 },
    accuracyWindow: {
      total: days.reduce((sum, entry) => sum + drillCount(entry), 0),
      correct: days.reduce((sum, entry) => sum + (entry.drillsCorrect ?? 0), 0),
    },
    directionWindow: direction ? directionTreffer(days, direction) : { total: 0, correct: 0 },
    weakAreas: direction ? weakAreasFor(days, direction) : [],
    forecast: dueForecast(alleKarten, now),
    milestones,
  };
}
