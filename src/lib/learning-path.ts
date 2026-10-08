import type { VocabEntry } from '@/data/vocab-types';

import { TOPICS, type ConversationSituation } from './conversation/types';
import type { PairDirection } from './languages/types';
import { contentDirectionOf, targetLanguageOf } from './languages/types';
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

function completionKey(direction: PairDirection, chapterId: string): string {
  return `learning-chapter:${direction}:${chapterId}`;
}

/** Completion is an explicit learner decision, stored only on this device. */
export async function finishedChapterIds(
  direction: PairDirection,
  chapters: LearningChapter[],
  store?: DataStore
): Promise<string[]> {
  const flags = await Promise.all(
    chapters.map((chapter) => readMeta<boolean>(completionKey(direction, chapter.id), false, store))
  );
  return chapters.filter((_, index) => flags[index]).map((chapter) => chapter.id);
}

export async function finishChapter(
  direction: PairDirection,
  chapterId: string,
  store?: DataStore
): Promise<void> {
  await writeMeta(completionKey(direction, chapterId), true, store);
}
