import type { VocabEntry } from '@/data/vocab-types';

import type { DrillId } from './drills/types';

import { TOPICS, type ConversationSituation } from './conversation/types';
import type { LanguageCode, PairDirection } from './languages/types';
import { contentDirectionOf, targetLanguageOf } from './languages/types';
import { isLearningStage, type LearningStage } from './learning-stages';
import { poolWoerterDerSzene } from './reading-texts';
import { readMeta, writeMeta } from './repository';
import type { DataStore } from './storage';
import { writingCandidates } from './writing/prompt';

export const CHAPTER_WORDS = 20;

export type LearningChapter = {
  id: string;
  situation: ConversationSituation;
  vocabulary: VocabEntry[];
};

const topicOrder = new Map(TOPICS.map((topic, index) => [topic.id, index]));

/** Only shipped conversations become chapters. A missing topic/level is never invented. */
export function chaptersForDirection(
  direction: PairDirection,
  situations: ConversationSituation[],
  entries: VocabEntry[]
): LearningChapter[] {
  const target = targetLanguageOf(direction);
  const contentDirection = contentDirectionOf(target);
  const scenes = situations
    .filter((situation) => situation.direction === contentDirection)
    .sort((a, b) =>
      a.level.localeCompare(b.level) ||
      (topicOrder.get(a.topic) ?? 99) - (topicOrder.get(b.topic) ?? 99) ||
      a.id.localeCompare(b.id)
    );
  const candidates = writingCandidates(direction, entries)
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id));

  return scenes.map((situation) => {
    const sceneWords = poolWoerterDerSzene(situation, candidates, target !== 'th');
    // Thai has no spaces between words. Prefer complete longer matches, so
    // incidental one-character substrings do not push scene words out.
    sceneWords.sort((a, b) =>
      Number(b.isConcrete) - Number(a.isConcrete) ||
      Number(b.partOfSpeech === 'noun') - Number(a.partOfSpeech === 'noun') ||
      (target === 'th' ? b.term.length - a.term.length : 0)
    );
    const vocabulary: VocabEntry[] = [];
    for (const word of sceneWords) {
      if (vocabulary.length >= CHAPTER_WORDS) break;
      if (vocabulary.some((entry) => entry.id === word.id)) continue;
      vocabulary.push(word);
    }
    return { id: situation.id, situation, vocabulary };
  });
}

/**
 * Welche Übung zu den Regeln der Szene passt — gelesen an den Überschriften
 * der Regeln (`corrections[].issue`, im Bestand Deutsch); die Erklärungen
 * erwähnen Nebenbei-Begriffe („fallender Ton“) und führten in die Irre.
 * Höflichkeitspartikeln kommen in fast jeder Thai-Szene vor und zählen
 * deshalb erst, wenn nichts Spezielleres passt.
 */
const REGEL_UEBUNGEN: readonly (readonly [RegExp, DrillId])[] = [
  [/Zählw|Klassifikator|Mengen/i, 'zaehlerwort'],
  [/ไกล|ใกล้|\bTon\b|Töne|Tonzeichen/i, 'toneRule'],
  [/Partizip|Perfekt|Präteritum|Vergangenheit|eingezogen/i, 'irregularPast'],
  [/\bser\b|\bestar\b/i, 'serEstar'],
  // \b: „Höflichkeitspartikel“ enthält „artikel“.
  [/\bArtikel|Kasus|Akkusativ|Dativ/i, 'article'],
  [/Partikel|ครับ|ค่ะ/i, 'polite'],
];

/** Die Übung für Schritt 1 eines Kapitels — `undefined`, wenn keine Regel passt. */
export function chapterGrammarDrill(
  situation: ConversationSituation,
  available: readonly string[]
): DrillId | undefined {
  const regeln = situation.corrections.map((hint) => hint.issue).join(' | ');
  return REGEL_UEBUNGEN.find(([muster, drill]) => available.includes(drill) && muster.test(regeln))?.[1];
}

function completionKey(direction: PairDirection, chapterId: string): string {
  return `learning-chapter:${direction}:${chapterId}`;
}

/** Completion is an explicit learner decision, stored only on this device. */
export async function finishedChapterIds(
  direction: PairDirection,
  chapters: readonly { id: string }[],
  store?: DataStore
): Promise<string[]> {
  const flags = await Promise.all(
    chapters.map((chapter) => readMeta<boolean>(completionKey(direction, chapter.id), false, store))
  );
  return chapters.filter((_, index) => flags[index]).map((chapter) => chapter.id);
}

function stepsKey(direction: PairDirection, chapterId: string): string {
  return `learning-chapter-steps:${direction}:${chapterId}`;
}

/**
 * Welche Schritte eines Kapitels schon geöffnet wurden — für das Häkchen in
 * der Schrittliste (Nutzertest 17.10.2026: erledigte Schritte waren nicht zu
 * erkennen). Wie der Kapitelabschluss nur auf diesem Gerät.
 */
export async function practisedSteps(
  direction: PairDirection,
  chapterId: string,
  store?: DataStore
): Promise<string[]> {
  return readMeta<string[]>(stepsKey(direction, chapterId), [], store);
}

export async function markStepPractised(
  direction: PairDirection,
  chapterId: string,
  step: string,
  store?: DataStore
): Promise<string[]> {
  const before = await practisedSteps(direction, chapterId, store);
  if (before.includes(step)) return before;
  const after = [...before, step];
  await writeMeta(stepsKey(direction, chapterId), after, store);
  return after;
}

export async function finishChapter(
  direction: PairDirection,
  chapterId: string,
  store?: DataStore
): Promise<void> {
  await writeMeta(completionKey(direction, chapterId), true, store);
}

function stageKey(language: LanguageCode): string {
  return `learning-stage:${language}`;
}

/**
 * Die im Lern-Reiter gewählte Stufe je Lernsprache, `null` ohne eigene Wahl
 * (Nutzerentscheidung 18.10.2026: bleibt über einen Neustart). Wie der
 * Kapitelabschluss nur auf diesem Gerät.
 */
export async function pickedStage(language: LanguageCode, store?: DataStore): Promise<LearningStage | null> {
  const stored = await readMeta<unknown>(stageKey(language), null, store);
  return isLearningStage(stored) ? stored : null;
}

export async function pickStage(language: LanguageCode, stage: LearningStage, store?: DataStore): Promise<void> {
  await writeMeta(stageKey(language), stage, store);
}
