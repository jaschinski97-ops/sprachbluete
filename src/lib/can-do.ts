import type { CheckRecord } from './chapter-recheck';
import { TOPICS, type TopicId } from './conversation/types';
import type { TranslationKey } from './i18n';
import type { LearningChapter } from './learning-path';
import { LEARNING_STAGES, stageForLevel, type LearningStage } from './learning-stages';

/**
 * Die Kann-Liste im Fortschritt (08.11.2026): Statt „312 Karten gelernt“
 * steht dort, was man damit tun kann — „Ich kann mich vorstellen“. Jede
 * Aussage gehört zu einem Thema und einer Stufe; sie gilt als geschafft, wenn
 * alle Kapitel dieses Themas in dieser Stufe abgeschlossen sind, und als
 * „sitzt“, wenn auch ihre Nachtests bestanden sind (`chapter-recheck.ts`).
 * Abgeschlossen allein heißt noch nicht, dass man es Wochen später kann.
 */

export type CanDoStatus = 'secured' | 'done' | 'started' | 'open';

export type CanDo = {
  topic: TopicId;
  stage: LearningStage;
  key: TranslationKey;
  done: number;
  /** Davon mit bestandenem Nachtest. */
  secured: number;
  total: number;
  status: CanDoStatus;
};

/** Die Kann-Aussagen, die es im Wörterbuch gibt (Thema × Stufe mit Dialogen). */
export const CAN_DO_KEYS = {
  'greeting.beginner': 'cando.greeting.beginner',
  'greeting.experienced': 'cando.greeting.experienced',
  'greeting.pro': 'cando.greeting.pro',
  'appointments.beginner': 'cando.appointments.beginner',
  'appointments.experienced': 'cando.appointments.experienced',
  'home.beginner': 'cando.home.beginner',
  'home.experienced': 'cando.home.experienced',
  'home.pro': 'cando.home.pro',
  'market.beginner': 'cando.market.beginner',
  'market.experienced': 'cando.market.experienced',
  'market.pro': 'cando.market.pro',
  'restaurant.beginner': 'cando.restaurant.beginner',
  'restaurant.experienced': 'cando.restaurant.experienced',
  'restaurant.pro': 'cando.restaurant.pro',
  'leisure.beginner': 'cando.leisure.beginner',
  'leisure.experienced': 'cando.leisure.experienced',
  'travel.beginner': 'cando.travel.beginner',
  'travel.experienced': 'cando.travel.experienced',
  'travel.pro': 'cando.travel.pro',
  'health.beginner': 'cando.health.beginner',
  'health.experienced': 'cando.health.experienced',
  'health.pro': 'cando.health.pro',
  'work.beginner': 'cando.work.beginner',
  'work.experienced': 'cando.work.experienced',
  'work.pro': 'cando.work.pro',
  'services.experienced': 'cando.services.experienced',
  'services.pro': 'cando.services.pro',
  'opinion.experienced': 'cando.opinion.experienced',
  'opinion.pro': 'cando.opinion.pro',
  'society.experienced': 'cando.society.experienced',
  'society.pro': 'cando.society.pro',
} as const satisfies Record<string, TranslationKey>;

export function canDoKey(topic: TopicId, stage: LearningStage): TranslationKey | null {
  return (CAN_DO_KEYS as Record<string, TranslationKey>)[`${topic}.${stage}`] ?? null;
}

/** Die Kann-Liste einer Lernsprache, nach Stufe und Themenreihenfolge. */
export function canDoList(
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  checks: Readonly<Record<string, CheckRecord>> = {}
): CanDo[] {
  return LEARNING_STAGES.flatMap((stage) => TOPICS.flatMap(({ id: topic }): CanDo[] => {
    const key = canDoKey(topic, stage);
    const own = chapters.filter((chapter) =>
      chapter.situation.topic === topic && stageForLevel(chapter.situation.level) === stage);
    if (!key || own.length === 0) return [];
    const done = own.filter((chapter) => finished.includes(chapter.id)).length;
    const secured = own.filter((chapter) => finished.includes(chapter.id) && checks[chapter.id]?.secured).length;
    return [{
      topic,
      stage,
      key,
      done,
      secured,
      total: own.length,
      status: secured === own.length ? 'secured' : done === own.length ? 'done' : done > 0 ? 'started' : 'open',
    }];
  }));
}
