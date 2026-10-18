import type { VocabEntry } from '@/data/vocab-types';

import { shuffled, seededRandom } from '../drills/random';
import { retrievability } from '../fsrs/fsrs';
import { FSRSCardState } from '../fsrs/types';
import { inStage, type LearningStage } from '../learning-stages';
import { loadCardStatesForDirection, loadVocabulary } from '../repository';
import { DataStore, getStore } from '../storage';
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
};

function weakness(card: FSRSCardState | undefined, now: number): number {
  return card ? retrievability(card, now) : 0;
}

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

  const [entries, cards] = await Promise.all([
    loadVocabulary(db),
    loadCardStatesForDirection('de_to_th', db),
  ]);
  const candidates = speakingCandidates(inStage(entries, options.stage));
  const cardByVocabId = new Map(cards.map((card) => [card.vocabId, card]));

  const ranked = [...candidates].sort(
    (a, b) =>
      weakness(cardByVocabId.get(a.id), now) - weakness(cardByVocabId.get(b.id), now)
  );

  // Wie bei den Auswahlübungen: aus einem Fenster der schwächsten Wörter
  // ziehen, damit mehrere Runden nicht wortgleich sind. Bei neuen Wörtern
  // (kein Kartenzustand) ist weakness = 0.
  const window = ranked.slice(0, Math.max(size, size * 3));
  const chosen = shuffled(window, random).slice(0, size);

  return {
    prompts: chosen.map(buildSpeakingPrompt),
    available: candidates.length,
  };
}
