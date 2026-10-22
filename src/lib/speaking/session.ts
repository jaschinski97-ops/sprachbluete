import type { VocabEntry } from '@/data/vocab-types';

import { seededRandom } from '../drills/random';
import type { PairDirection } from '../languages/types';
import { inStage, type LearningStage } from '../learning-stages';
import { selectPracticeWords } from '../practice-selection';
import { loadCardStatesForDirection, loadVocabulary } from '../repository';
import { DataStore, getStore } from '../storage';
import { loadWordPractice } from '../word-practice';
import { buildSpeakingPrompt, canBuildSpeakingPrompt, SpeakingPrompt } from './domain';

/** Sprechaufgaben je Runde. */
export const SPEAKING_SESSION_SIZE = 10;

/**
 * Die Sprechübung liest den bestehenden FSRS-Zustand nur für die Auswahl.
 *
 * Sie legt keine Karten an und schreibt kein Messergebnis zurück: Gemessen
 * wird allein die Tonhöhenkontur, nicht die ganze Aussprache und auch nicht
 * der lexikalische Abruf. Eine solche Teilmessung darf den Wiederholungsplan
 * der vollständigen Vokabel nicht verlängern oder verkürzen (AE-35).
 */
export type SpeakingSession = {
  prompts: SpeakingPrompt[];
  available: number;
};

export type SpeakingSessionOptions = {
  store?: DataStore;
  now?: number;
  size?: number;
  /** Für reproduzierbare Tests; im Betrieb wechselt die Auswahl je Start. */
  seed?: number;
  /** Nur Wörter dieser Stufe (Stufenschalter im Lern-Reiter, 18.10.2026). */
  stage?: LearningStage;
  /**
   * Die Lernrichtung, deren Karten die Auswahl lesen (22.10.2026). Vorher
   * immer `de_to_th` — auf englischer Oberfläche (`en_to_th`) wurde damit
   * nach einem fremden Kartenstand gewichtet.
   */
  direction?: PairDirection;
};

function speakingCandidates(entries: VocabEntry[]): VocabEntry[] {
  return entries.filter(canBuildSpeakingPrompt);
}

export async function buildSpeakingSession(
  options: SpeakingSessionOptions = {}
): Promise<SpeakingSession> {
  const now = options.now ?? Date.now();
  const size = options.size ?? SPEAKING_SESSION_SIZE;
  const random = seededRandom(options.seed ?? now);
  const db = options.store ?? (await getStore());

  const [entries, cards, practice] = await Promise.all([
    loadVocabulary(db),
    loadCardStatesForDirection(options.direction ?? 'de_to_th', db),
    loadWordPractice(db),
  ]);
  const candidates = speakingCandidates(inStage(entries, options.stage));
  const cardByVocabId = new Map(cards.map((card) => [card.vocabId, card]));

  // Wie bei den Auswahlübungen (`practice-selection.ts`): gelernte, wacklige
  // Wörter zuerst, nur wenige neue, aus einem Fenster gezogen.
  const chosen = selectPracticeWords(candidates, {
    idOf: (entry) => entry.id,
    cards: cardByVocabId,
    practice,
    now,
    size,
    random,
  });

  return {
    prompts: chosen.map(buildSpeakingPrompt),
    available: candidates.length,
  };
}
