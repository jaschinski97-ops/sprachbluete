import type { VocabEntry } from '@/data/vocab-types';

import { seededRandom, shuffled } from '../drills/random';
import { retrievability } from '../fsrs/fsrs';
import { FSRSCardState, Rating } from '../fsrs/types';
import type { PairDirection } from '../languages/types';
import { inStage, type LearningStage } from '../learning-stages';
import { loadOrCreateCardState, rateCard } from '../repository';
import { ensureCardStates } from '../review-session';
import { DataStore, getStore } from '../storage';

import { compareWriting, WritingVerdict } from './compare';
import { buildWritingPrompt, WritingPrompt, writingCandidates } from './prompt';
import { ratingForVerdict } from './rating';

/**
 * Eine Runde freies Schreiben — und die einzige Übung, die FSRS füttert.
 *
 * DERSELBE KARTENZUSTAND WIE DIE KARTEIKARTE, nicht ein eigener. Die Frage
 * stellt Pflicht 4 ausdrücklich, und die Antwort folgt aus AE-16: „FSRS
 * modelliert eine Erinnerungsspur je Item." Eine Schreibaufgabe in Richtung
 * `de_to_th` fragt „Deutsch gesehen, Thai hervorbringen" — das ist Wort für
 * Wort dieselbe Tatsache, die die Karteikarte derselben Richtung abfragt. Ein
 * zweiter Schlüssel dafür hieße, dieselbe Erinnerung mit zwei auseinander-
 * laufenden Intervallen abzufragen; genau das will Spaced Repetition
 * vermeiden. Der Schlüssel bleibt also `vocabId:direction`, das Dashboard
 * zählt weiter genau eine Karte je Vokabel und Richtung.
 *
 * DIE SCHREIBAUFGABE IST DABEI DER BESSERE MESSPUNKT. Die Karteikarte fragt
 * hinterher „wie gut saß das?" — eine Selbsteinschätzung, die man sich schön
 * reden kann. Hier steht vorher fest, was richtig ist, und die Person hat es
 * getippt oder eben nicht. Deshalb darf diese Übung schreiben, wo die
 * Auswahlübungen es nicht dürfen (AE-16) und die Tonkonturmessung es nicht
 * darf (AE-35).
 *
 * FOLGE FÜR DIE STATISTIK: Weil `rateCard` das Tagesprotokoll fortschreibt,
 * zählt eine beantwortete Schreibaufgabe als **Wiederholung** und nicht als
 * Übung. Das ist richtig herum: Sie ist eine. Doppelt zu zählen — einmal als
 * Wiederholung, einmal als Übung — würde die Zahlen aufblähen.
 */

export const WRITING_SESSION_SIZE = 10;

/** Aus wie vielen der schwächsten Kandidaten gezogen wird (wie bei den Übungen). */
const CANDIDATE_WINDOW = 3;

export type WritingSession = {
  direction: PairDirection;
  prompts: WritingPrompt[];
  /** Wie viele Vokabeln für diese Richtung überhaupt taugen. */
  available: number;
};

export type WritingSessionOptions = {
  direction: PairDirection;
  store?: DataStore;
  now?: number;
  size?: number;
  seed?: number;
  entries?: VocabEntry[];
  /** Ohne eigene Wortliste: nur Wörter dieser Stufe (18.10.2026). */
  stage?: LearningStage;
};

function weakness(card: FSRSCardState | undefined, now: number): number {
  return card ? retrievability(card, now) : 0;
}

export async function buildWritingSession(
  options: WritingSessionOptions
): Promise<WritingSession> {
  const { direction } = options;
  const now = options.now ?? Date.now();
  const size = options.size ?? WRITING_SESSION_SIZE;
  const random = seededRandom(options.seed ?? now);

  const db = options.store ?? (await getStore());
  const { entries, cards } = await ensureCardStates(direction, db, now);
  const pool = options.entries ?? (options.stage ? inStage(entries, options.stage) : entries);

  const cardByVocabId = new Map(cards.map((card) => [card.vocabId, card]));
  const candidates = writingCandidates(direction, pool);
  const synonymPool = pool === entries ? candidates : writingCandidates(direction, entries);

  // Dieselbe Auswahl wie bei den Uebungen aus Phase 6: Schwerpunkt auf dem
  // Wackligen, aber aus einem Fenster gezogen, damit sich eine Runde nicht
  // woertlich wiederholt.
  const ranked = [...candidates].sort(
    (a, b) => weakness(cardByVocabId.get(a.id), now) - weakness(cardByVocabId.get(b.id), now)
  );
  const window = ranked.slice(0, Math.max(size, size * CANDIDATE_WINDOW));
  const chosen = shuffled(window, random).slice(0, size);

  return {
    direction,
    // Synonyme aus dem ganzen Wortschatz der Sprache, nicht nur aus dem
    // Kapitelpool: In einer 16-Wort-Runde fehlte sonst „nicht“ als gültige
    // Antwort auf „ไม่“ (Testlauf 04.10.2026).
    prompts: chosen.map((entry) => buildWritingPrompt(entry, direction, synonymPool)),
    available: candidates.length,
  };
}

export type WritingResult = {
  assisted?: boolean;
  prompt: WritingPrompt;
  given: string;
  verdict: WritingVerdict;
  rating: Rating;
  /** Der Kartenzustand **nach** der Bewertung — für die Rückmeldung. */
  card: FSRSCardState;
};

/**
 * Eine Antwort prüfen, bewerten und die Karte fortschreiben.
 *
 * Der Abgleich läuft **vor** dem Schreibzugriff und vollständig offline; erst
 * das Ergebnis wandert in `rateCard`, also in dieselbe Funktion, die auch die
 * Karteikarte benutzt. Es gibt hier bewusst keinen zweiten Schreibpfad in den
 * Kartenzustand.
 */
export async function submitWriting(
  prompt: WritingPrompt,
  given: string,
  options: { store?: DataStore; now?: number; assisted?: boolean } = {}
): Promise<WritingResult> {
  const now = options.now ?? Date.now();
  const verdict = compareWriting(given, { language: prompt.language, targets: prompt.targets });
  const rating = ratingForVerdict(verdict);

  const db = options.store ?? (await getStore());
  const card = await loadOrCreateCardState(prompt.vocabId, prompt.direction, db, now);
  const updated = options.assisted ? card : await rateCard(card, rating, db, now);

  return { prompt, given, verdict, rating, card: updated, ...(options.assisted ? { assisted: true } : {}) };
}

export function summarizeWriting(results: WritingResult[]): {
  correct: number;
  exact: number;
  total: number;
} {
  return {
    correct: results.filter((result) => result.verdict.correct).length,
    exact: results.filter((result) => result.verdict.exact).length,
    total: results.length,
  };
}
