/**
 * FSRS-Wiederholungsplanung.
 *
 * Die Formeln sind aus dem geprüften Web-Referenzprototyp übernommen und nicht
 * neu hergeleitet. Übernommen wurden: Retrievability-Kurve, Intervallformel,
 * Difficulty-Update mit Mean-Reversion und das Stabilitätswachstum bzw. der
 * Stabilitätseinbruch nach einem Lapse.
 *
 * WICHTIG: `DEFAULT_WEIGHTS` ist eine **Näherung** an veröffentlichte
 * FSRS-Gewichte, keine zertifizierte Kopie. Die Werte stammen aus dem
 * Referenzprototyp. Wer die Planung wissenschaftlich sauber haben will, muss
 * die Gewichte gegen die offizielle FSRS-Veröffentlichung abgleichen oder aus
 * eigenen Lerndaten optimieren.
 */

import { CardState, FSRSCardState, PairDirection, Rating } from './types';

export const DAY_MS = 86_400_000;

/** Faktor aus der FSRS-Vergessenskurve. */
const FACTOR = 19 / 81;

/** Ziel-Retrievability zum Fälligkeitszeitpunkt (90 %). */
const REQUEST_RETENTION = 0.9;

/** Ab dieser Stabilität (in Tagen) gilt eine Karte als „gemeistert". */
const MASTERED_STABILITY_DAYS = 21;

/** Näherung an veröffentlichte FSRS-Gewichte — siehe Modulkommentar. */
export const DEFAULT_WEIGHTS = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
] as const;

export type Weights = readonly number[];

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Frische Karte, sofort fällig, noch ohne Stabilität oder Difficulty. */
export function createCardState(
  vocabId: string,
  // SEIT DEN KREUZRICHTUNGEN AUF `PairDirection` (reine Weitung): Auch für
  // `en_to_es` & Co. entsteht hier die erste Karte; de-geankerte Aufrufer
  // übergeben weiter ihre `Direction`-Werte.
  direction: PairDirection,
  now: number = Date.now()
): FSRSCardState {
  return {
    vocabId,
    direction,
    state: 'new',
    difficulty: null,
    stability: null,
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
  };
}

/**
 * Abrufwahrscheinlichkeit zum Zeitpunkt `now`:
 *
 *     R = (1 + (19/81) * t / S) ^ -0.5
 *
 * `t` ist der Abstand zur letzten Bewertung in Tagen. Eine noch nie bewertete
 * Karte hat keine Stabilität und damit definitionsgemäß R = 0.
 */
export function retrievability(card: FSRSCardState, now: number = Date.now()): number {
  if (card.lastReview === null || card.stability === null) return 0;
  const elapsedDays = Math.max(0, (now - card.lastReview) / DAY_MS);
  return Math.pow(1 + (FACTOR * elapsedDays) / card.stability, -0.5);
}

/**
 * Intervall in ganzen Tagen, nach dem die Retrievability auf
 * `REQUEST_RETENTION` abgefallen ist. Mindestens ein Tag.
 */
export function nextIntervalDays(stability: number): number {
  const raw = (stability * (Math.pow(REQUEST_RETENTION, -2) - 1)) / FACTOR;
  return Math.max(1, Math.round(raw));
}

/**
 * Wendet eine Bewertung auf eine Karte an und gibt den **neuen** Zustand
 * zurück. Die Eingabekarte wird nicht verändert.
 */
export function reviewCard(
  card: FSRSCardState,
  rating: Rating,
  now: number = Date.now(),
  weights: Weights = DEFAULT_WEIGHTS
): FSRSCardState {
  const W = weights;
  const isFirstReview = card.stability === null || card.difficulty === null;

  // Difficulty, auf die das Mean-Reversion-Update zurückzieht.
  const easyAnchor = clamp(W[4] - W[5], 1, 10);

  let difficulty: number;
  let stability: number;

  if (isFirstReview) {
    stability = W[rating - 1];
    difficulty = clamp(W[4] - (rating - 3) * W[5], 1, 10);
  } else {
    const R = retrievability(card, now);
    const shifted = clamp(card.difficulty! - W[6] * (rating - 3), 1, 10);
    // Mean-Reversion: zieht die Difficulty langsam Richtung `easyAnchor`
    // zurück, damit einzelne Ausreißer sie nicht dauerhaft verschieben.
    difficulty = clamp(W[7] * easyAnchor + (1 - W[7]) * shifted, 1, 10);

    if (rating === 1) {
      // Lapse: Stabilität bricht ein statt zu wachsen.
      stability =
        W[11] *
        Math.pow(difficulty, -W[12]) *
        (Math.pow(card.stability! + 1, W[13]) - 1) *
        Math.exp(W[14] * (1 - R));
    } else {
      const hardPenalty = rating === 2 ? W[15] : 1;
      const easyBonus = rating === 4 ? W[16] : 1;
      const growth =
        Math.exp(W[8]) *
        (11 - difficulty) *
        Math.pow(card.stability!, -W[9]) *
        (Math.exp(W[10] * (1 - R)) - 1);
      stability = card.stability! * (1 + growth * hardPenalty * easyBonus);
    }
  }

  stability = Math.max(0.1, stability);

  const nextState: CardState =
    rating === 1 ? 'learning' : stability > MASTERED_STABILITY_DAYS ? 'mastered' : 'review';

  return {
    ...card,
    difficulty,
    stability,
    state: nextState,
    reps: card.reps + 1,
    lapses: card.lapses + (rating === 1 ? 1 : 0),
    lastReview: now,
    due: now + nextIntervalDays(stability) * DAY_MS,
  };
}

/** Ist die Karte jetzt fällig? */
export function isDue(card: FSRSCardState, now: number = Date.now()): boolean {
  return card.due <= now;
}

/**
 * Obergrenze an nie bewerteten Karten je Sitzungszusammenstellung.
 *
 * Neue Karten haben R = 0 und stünden sonst in JEDER Sitzung ganz vorn: bei
 * wachsendem Grundstock fluteten sie die Sitzung, und die fälligen Karten —
 * das, was der Spaced Repetition eigentlich gehört — verhungerten dahinter.
 * Der Lernpfad nutzt 20 Wörter je Runde. Fällige Wiederholungen stehen davor;
 * dadurch können in einer gemischten Runde weniger als 20 neue Wörter stehen.
 */
export const NEW_CARDS_PER_SESSION = 20;

/**
 * Fällige Karten für eine Sitzung: bereits Gelernte zuerst, schwächste voran
 * — die Karte, die am ehesten vergessen ist, wird zuerst abgefragt. Nie
 * bewertete Karten kommen DAHINTER und höchstens `NEW_CARDS_PER_SESSION`
 * Stück (siehe dort).
 */
export function dueCards(cards: FSRSCardState[], now: number = Date.now()): FSRSCardState[] {
  const due = cards.filter((card) => isDue(card, now));
  const reviewed = due
    .filter((card) => card.state !== 'new')
    .sort((a, b) => retrievability(a, now) - retrievability(b, now));
  const fresh = due.filter((card) => card.state === 'new').slice(0, NEW_CARDS_PER_SESSION);
  return [...reviewed, ...fresh];
}
