import { activeVocabularyFor } from '@/data/active-vocabulary';
import type { TranslationKey } from '@/lib/i18n';

import { loadCheckRecords, type CheckRecord } from './chapter-recheck';
import { groupsForDirection, modesForDirection, type Mode } from './exercise-catalog';
import { FOUNDATIONS_ID, foundationSteps } from './foundations';
import { targetLanguageOf, type PairDirection } from './languages/types';
import {
  chapterGrammarDrill,
  chaptersForDirection,
  finishedChapterIds,
  practisedSteps,
  type LearningChapter,
} from './learning-path';
import { stageForLevel, type LearningStage } from './learning-stages';
import { loadSituations } from './repository';

/**
 * Der Ablauf eines Kapitels als Lernzyklus (08.11.2026, Nutzerentscheidung):
 * Verstehen → Wörter und Regel → selbst anwenden → Kapitel-Check.
 *
 * Lernpfad, Startseite und „Weiter: …“ in der Übung lesen alle diese
 * Reihenfolge, damit nirgends ein anderer nächster Schritt steht.
 */

export type ChapterStep = readonly [Mode, TranslationKey];

/**
 * Die acht Schritte eines Kapitels. Seit 18.10.2026 kommt der Dialog zuerst
 * (Nutzerentscheidung): Wer die Regel vor dem Dialog liest, kennt ihre
 * Beispiele noch nicht. Der Kapitel-Check ist der letzte Schritt.
 */
export function chapterSteps(direction: PairDirection, chapter: LearningChapter): ChapterStep[] {
  const grammar: Mode = chapterGrammarDrill(chapter.situation, modesForDirection(direction))
    ?? (targetLanguageOf(direction) === 'th' ? 'polite' : chapterGrammarFallback(direction));
  return [
    ['sentenceListening', 'mode.sentenceListening'],
    ['lesestoffe', 'mode.lesestoffe'],
    ['cards', 'mode.cards'],
    [grammar, 'skill.grammatik'],
    ['writing', 'mode.writing'],
    ['sentenceRepeat', 'mode.sentenceRepeat'],
    ['rollenspiel', 'mode.rollenspiel'],
    ['kapitelCheck', 'chapterCheck.title'],
  ];
}

/** Die erste Grammatikübung der Sprache — die Regelübersicht ist keine Übung. */
function chapterGrammarFallback(direction: PairDirection): Mode {
  const modes = groupsForDirection(direction)[4].modes.filter((mode) => mode !== 'grammatikRegeln');
  return modes[0] ?? 'grammatikRegeln';
}

export type ChapterPhase = {
  title: TranslationKey;
  /** Ein Satz, warum die Phase an dieser Stelle steht. */
  why: TranslationKey;
  /** Die Schritte der Phase mit ihrer Stelle im ganzen Kapitel. */
  steps: { step: ChapterStep; index: number }[];
};

/** Wo die Phasen in `chapterSteps` beginnen: Verstehen, Lernen, Anwenden, Check. */
const PHASES: readonly { title: TranslationKey; why: TranslationKey; from: number }[] = [
  { title: 'phase.understand', why: 'phase.understandWhy', from: 0 },
  { title: 'phase.learn', why: 'phase.learnWhy', from: 2 },
  { title: 'phase.apply', why: 'phase.applyWhy', from: 4 },
  { title: 'phase.check', why: 'phase.checkWhy', from: 7 },
];

export function chapterPhases(steps: readonly ChapterStep[]): ChapterPhase[] {
  return PHASES.map((phase, position) => {
    const to = PHASES[position + 1]?.from ?? steps.length;
    return {
      title: phase.title,
      why: phase.why,
      steps: steps.slice(phase.from, to).map((step, offset) => ({ step, index: phase.from + offset })),
    };
  }).filter((phase) => phase.steps.length > 0);
}

/** Der erste noch nicht geöffnete Schritt; `steps.length`, wenn alle geöffnet sind. */
export function nextOpenStep(steps: readonly ChapterStep[], practised: readonly string[]): number {
  const index = steps.findIndex(([mode]) => !practised.includes(mode));
  return index === -1 ? steps.length : index;
}

/**
 * Das Kapitel, an dem es weitergeht: in der gewählten Stufe das erste offene,
 * sonst das erste offene überhaupt. Kapitel 0 kommt bei den Anfängern zuerst,
 * solange es nicht abgeschlossen ist. `null`, wenn alles abgeschlossen ist.
 */
export function nextChapterId(
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  stage: LearningStage
): string | null {
  if (stage === 'beginner' && !finished.includes(FOUNDATIONS_ID)) return FOUNDATIONS_ID;
  const open = chapters.filter((chapter) => !finished.includes(chapter.id));
  return (open.find((chapter) => stageForLevel(chapter.situation.level) === stage) ?? open[0])?.id ?? null;
}

export type NextStep = {
  chapterId: string;
  /** Kapitel 0 „Grundlagen“ statt eines Dialogkapitels. */
  foundations: boolean;
  chapter: LearningChapter | null;
  /** 1-basierte Stelle des Kapitels in seiner Stufe (Kapitel 0 = 0). */
  position: number;
  /** Der nächste offene Schritt; fehlt, wenn alle Schritte schon geöffnet sind. */
  step: ChapterStep | null;
  stepIndex: number;
  stepCount: number;
};

/** Wo es im Lernpfad weitergeht — für die Startseite und das Ende der Heutigen Runde. */
export function nextStepFor(
  direction: PairDirection,
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  practised: Readonly<Record<string, readonly string[]>>,
  stage: LearningStage
): NextStep | null {
  const chapterId = nextChapterId(chapters, finished, stage);
  if (!chapterId) return null;
  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
  const steps: readonly ChapterStep[] = chapter ? chapterSteps(direction, chapter) : foundationSteps(direction);
  const stepIndex = nextOpenStep(steps, practised[chapterId] ?? []);
  const sameStage = chapter
    ? chapters.filter((item) => stageForLevel(item.situation.level) === stageForLevel(chapter.situation.level))
    : [];
  return {
    chapterId,
    foundations: chapter === null,
    chapter,
    position: chapter ? sameStage.indexOf(chapter) + 1 : 0,
    step: steps[stepIndex] ?? null,
    stepIndex,
    stepCount: steps.length,
  };
}

export type ChapterProgress = {
  chapters: LearningChapter[];
  /** Abgeschlossene Kapitel, Kapitel 0 eingeschlossen. */
  finished: string[];
  /** Geöffnete Schritte je Kapitel. */
  practised: Record<string, string[]>;
  /** Kapitel-Check und Nachtests je Dialogkapitel (`chapter-recheck.ts`). */
  checks: Record<string, CheckRecord>;
};

/**
 * Kapitel und Lernstand einer Richtung — Lern-Reiter, Startseite und
 * Fortschritt lesen denselben Stand. Die Lernsprache muss geladen sein.
 */
export async function loadChapterProgress(direction: PairDirection): Promise<ChapterProgress> {
  const situations = await loadSituations();
  const chapters = chaptersForDirection(direction, situations, activeVocabularyFor(targetLanguageOf(direction)));
  // Kapitel 0 teilt Abschluss und Häkchen mit den Dialogkapiteln.
  const ids = [FOUNDATIONS_ID, ...chapters.map((item) => item.id)];
  const finished = await finishedChapterIds(direction, ids.map((id) => ({ id })));
  const [steps, checks] = await Promise.all([
    Promise.all(ids.map((id) => practisedSteps(direction, id))),
    loadCheckRecords(direction, chapters.map((item) => item.id)),
  ]);
  return { chapters, finished, practised: Object.fromEntries(ids.map((id, index) => [id, steps[index]])), checks };
}

/** Ohne eigene Wahl gilt die Stufe des nächsten offenen Kapitels. */
export function defaultStage(
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  picked: LearningStage | null
): LearningStage {
  const next = chapters.find((item) => !finished.includes(item.id)) ?? chapters[0];
  return picked ?? (next ? stageForLevel(next.situation.level) : 'beginner');
}
