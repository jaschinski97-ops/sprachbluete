import type { TranslationKey } from './i18n/keys';
export const LEARNING_STAGES = ['beginner', 'experienced', 'pro'] as const;
export type LearningStage = typeof LEARNING_STAGES[number];
export const STAGE_KEYS: Record<LearningStage, TranslationKey> = {
  beginner: 'level.beginner', experienced: 'level.experienced', pro: 'level.pro',
};
export const STAGE_LEVELS = {
  beginner: ['A1', 'A2'], experienced: ['B1', 'B2'], pro: ['C1', 'C2'],
} as const;
export function stageForLevel(level: string): LearningStage {
  return level.startsWith('C') ? 'pro' : level.startsWith('B') ? 'experienced' : 'beginner';
}
export const levelLabelKey = (level: string): TranslationKey => STAGE_KEYS[stageForLevel(level)];

/**
 * Jede sichtbare Stufe fasst zwei GER-Stufen zusammen (A1/A2 …). Ohne Teil-
 * Angabe standen „Auf dem Obstmarkt“ (A1) und „Obstkauf auf dem Markt“ (A2)
 * als scheinbare Dubletten unter „Anfänger“ (Nutzertest 17.10.2026).
 */
export const levelPartKey = (level: string): TranslationKey =>
  level.endsWith('2') ? 'level.partTwo' : 'level.partOne';
