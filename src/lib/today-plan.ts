import type { Mode } from './exercise-catalog';
import { ROUND_MINUTES } from './today-round';

/**
 * Grobe Dauer der Teile von „Deine Runde“ (Startseite) und der Kapitelphasen
 * (09.11.2026, Entwürfe A und B). Die Werte sind geschätzt, nicht gemessen:
 * Sie sollen nur sagen, ob etwas zwei oder zwanzig Minuten dauert. Deshalb
 * steht in der App immer „ca.“ davor.
 */

/** Minuten je Kapitelschritt; was fehlt, nimmt `STANDARD_SCHRITT_MINUTEN`. */
const SCHRITT_MINUTEN: Partial<Record<Mode, number>> = {
  sentenceListening: 4,
  lesestoffe: 5,
  cards: 6,
  writing: 5,
  sentenceRepeat: 4,
  rollenspiel: 5,
  kapitelCheck: 3,
};

/** Grammatikübungen und die Schritte von Kapitel 0. */
export const STANDARD_SCHRITT_MINUTEN = 4;

/** Ein Nachtest ist ein Kapitel-Check: acht kurze Fragen. */
export const NACHTEST_MINUTEN = 3;

export function stepMinutes(mode: Mode): number {
  return SCHRITT_MINUTEN[mode] ?? STANDARD_SCHRITT_MINUTEN;
}

/**
 * Wie lange die Runde auf der Startseite ungefähr dauert: die Heutige Runde
 * (nur wenn etwas fällig ist, sie startet sonst nicht), ein fälliger
 * Nachtest und der nächste Kapitelschritt. 0, wenn nichts ansteht.
 */
export function todayMinutes(input: { reviews: number; recheck: boolean; step: Mode | null }): number {
  return (input.reviews > 0 ? ROUND_MINUTES : 0)
    + (input.recheck ? NACHTEST_MINUTEN : 0)
    + (input.step ? stepMinutes(input.step) : 0);
}
