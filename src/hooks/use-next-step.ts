import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ensureLanguages } from '@/lib/content/catalog-languages';
import { defaultStage, loadChapterProgress, nextStepFor, type NextStep } from '@/lib/chapter-flow';
import { dueRecheck } from '@/lib/chapter-recheck';
import type { LearningChapter } from '@/lib/learning-path';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { pickedStage } from '@/lib/learning-path';

export type NextStepState = {
  direction: PairDirection;
  /** `null`, wenn alle Kapitel abgeschlossen sind. */
  next: NextStep | null;
  /** Das Kapitel mit fälligem Nachtest, sonst `null`. */
  recheck: LearningChapter | null;
};

/**
 * Der nächste Schritt im Lernpfad einer Richtung — für „Heute“ auf der
 * Startseite. Neu gelesen, sobald die Übersicht wieder sichtbar wird: Wer im
 * Lern-Reiter einen Schritt geöffnet hat, sieht beim Zurückkommen den
 * nächsten. `undefined`, solange er lädt oder das Laden scheiterte.
 */
export function useNextStep(direction: PairDirection | null): NextStepState | undefined {
  const [state, setState] = useState<NextStepState | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    if (!direction) return;
    let cancelled = false;
    const language = targetLanguageOf(direction);
    void (async () => {
      await ensureLanguages([language]);
      const [progress, picked] = await Promise.all([
        loadChapterProgress(direction),
        pickedStage(language).catch(() => null),
      ]);
      const stage = defaultStage(progress.chapters, progress.finished, picked);
      return {
        next: nextStepFor(direction, progress.chapters, progress.finished, progress.practised, stage),
        recheck: dueRecheck(progress.chapters, progress.finished, progress.checks, Date.now()),
      };
    })()
      .then(({ next, recheck }) => { if (!cancelled) setState({ direction, next, recheck }); })
      .catch(() => { if (!cancelled) setState(undefined); });
    return () => { cancelled = true; };
  }, [direction]));
  return state?.direction === direction ? state : undefined;
}
