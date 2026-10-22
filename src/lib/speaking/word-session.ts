import type { VocabEntry } from '@/data/vocab-types';

import { bridgeText } from '../languages/bridge';
import { anchorOf, type PairDirection } from '../languages/types';
import { inStage, type LearningStage } from '../learning-stages';
import { selectPracticeWords } from '../practice-selection';
import { ensureCardStates } from '../review-session';
import { seededRandom } from '../drills/random';
import { type DataStore } from '../storage';
import { loadWordPractice } from '../word-practice';

/**
 * Wort-Nachsprechen für Englisch und Spanisch (Lern-Reiter-Ausbau 13.09.).
 *
 * WAS DAS VON DER THAI-SPRECHÜBUNG UNTERSCHEIDET: Dort misst
 * `lib/speaking` die Tonhöhenkontur gegen quellengeprüfte Silbentöne
 * (AE-48) — ein Verfahren, das es für Englisch und Spanisch nicht gibt,
 * und behauptet wird auch keins. Die Übung hier ist deshalb ehrlich
 * einfacher: Musterlösung anhören, selbst nachsprechen, selbst
 * einschätzen. Kein Mikrofon, keine Messung, kein Punktwert, keine
 * FSRS-Änderung — Aussprache-Übung durch Vergleich, wie beim Shadowing,
 * nur wortweise.
 *
 * WELCHE WÖRTER DRANKOMMEN: dieselbe Auswahl wie in den Auswahlübungen
 * (`practice-selection.ts`) — gelernte, wacklige Wörter der RICHTUNG
 * zuerst, nur wenige neue, gezogen aus einem Fenster, damit die Runde sich
 * nicht wörtlich wiederholt. Die Übung schreibt den Zustand bewusst NICHT fort
 * (dafür sind Karteikarten, Diktat und freies Schreiben da).
 */

/** Aufgaben je Runde. */
export const WORD_SPEAKING_SIZE = 8;

export type WordSpeakingTask = {
  /** Die Vokabel-ID — eindeutig innerhalb der Runde. */
  id: string;
  /** Das Wort in der Zielsprache — steht groß da und wird vorgespielt. */
  term: string;
  /** Lesehilfe der Sprache (Umschrift, Silben, Lautschrift). */
  roman: string;
  /** Die Bedeutung in der Ankersprache der Richtung (App-Sprache). */
  meaning: string;
};

export type WordSpeakingSession = {
  tasks: WordSpeakingTask[];
  /** Wie viele Wörter der Sprache überhaupt zur Verfügung stehen. */
  available: number;
};

function taskOf(entry: VocabEntry, direction: PairDirection): WordSpeakingTask {
  return {
    id: entry.id,
    term: entry.term,
    roman: entry.romanization || entry.ipa || entry.term,
    meaning: bridgeText(entry, anchorOf(direction)).text,
  };
}

export async function buildWordSpeakingSession(options: {
  direction: PairDirection;
  store?: DataStore;
  now?: number;
  seed?: number;
  size?: number;
  /** Nur Wörter dieser Stufe (Stufenschalter im Lern-Reiter, 18.10.2026). */
  stage?: LearningStage;
}): Promise<WordSpeakingSession> {
  const now = options.now ?? Date.now();
  const size = options.size ?? WORD_SPEAKING_SIZE;
  const random = seededRandom(options.seed ?? now);

  const { entries: alle, cards } = await ensureCardStates(options.direction, options.store, now);
  const entries = inStage(alle, options.stage);
  const byVocabId = new Map(cards.map((card) => [card.vocabId, card]));
  const practice = await loadWordPractice(options.store);

  const chosen = selectPracticeWords(entries, {
    idOf: (entry) => entry.id,
    cards: byVocabId,
    practice,
    now,
    size,
    random,
  });

  return { tasks: chosen.map((entry) => taskOf(entry, options.direction)), available: entries.length };
}
