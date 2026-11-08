import { RULE_THEME_CODES } from '@/data/grammar-themes';

import { chapterSteps } from './chapter-flow';
import type { CheckRecord } from './chapter-recheck';
import { situationTranslation } from './conversation/types';
import type { TranslationKey } from './i18n';
import type { UiLanguage } from './i18n/types';
import type { PairDirection } from './languages/types';
import type { LearningChapter } from './learning-path';

/**
 * Die Grammatik-Übersicht (08.11.2026): alle Regeln der Dialoge einer
 * Lernsprache, nach Themen geordnet. Bisher sah man eine Regel nur in ihrem
 * Kapitel; wer „Wie war das mit der Verneinung?“ nachschlagen wollte, musste
 * das Kapitel wiederfinden. Die Regeln selbst bleiben die geprüften Texte der
 * Dialoge — hier kommt nur die Ordnung dazu (`data/grammar-themes.ts`).
 */

/** Reihenfolge der Themen: vom ersten Gespräch zu den feineren Fragen. */
export const GRAMMAR_THEMES = [
  'hoeflichkeit',
  'fragen',
  'verneinung',
  'verben',
  'nomen',
  'mengen',
  'praepositionen',
  'satzbau',
  'verbinden',
  'aussprache',
  'wortwahl',
  'weitere',
] as const;
export type GrammarTheme = (typeof GRAMMAR_THEMES)[number];

/** Die Buchstaben in `RULE_THEME_CODES`. „weitere“ hat keinen: Es ist der Rückfall. */
export const THEME_CODES: Readonly<Record<string, Exclude<GrammarTheme, 'weitere'>>> = {
  H: 'hoeflichkeit',
  F: 'fragen',
  N: 'verneinung',
  V: 'verben',
  A: 'nomen',
  M: 'mengen',
  P: 'praepositionen',
  S: 'satzbau',
  K: 'verbinden',
  L: 'aussprache',
  W: 'wortwahl',
};

export const THEME_KEYS: Record<GrammarTheme, TranslationKey> = {
  hoeflichkeit: 'grammarTheme.hoeflichkeit',
  fragen: 'grammarTheme.fragen',
  verneinung: 'grammarTheme.verneinung',
  verben: 'grammarTheme.verben',
  nomen: 'grammarTheme.nomen',
  mengen: 'grammarTheme.mengen',
  praepositionen: 'grammarTheme.praepositionen',
  satzbau: 'grammarTheme.satzbau',
  verbinden: 'grammarTheme.verbinden',
  aussprache: 'grammarTheme.aussprache',
  wortwahl: 'grammarTheme.wortwahl',
  weitere: 'grammarTheme.weitere',
};

/** Das Thema einer Regel; Regeln neuer Dialoge ohne Zuordnung landen unter „weitere“. */
export function ruleTheme(situationId: string, index: number): GrammarTheme {
  const code = RULE_THEME_CODES[situationId]?.[index];
  return (code ? THEME_CODES[code] : undefined) ?? 'weitere';
}

/**
 * Offen · Grammatikschritt des Kapitels geöffnet · Kapitel bestanden ·
 * Nachtest bestanden. „Geöffnet“ heißt nicht „gekonnt“ — deshalb steht in der
 * Übersicht „angefangen“, nicht „geübt“.
 */
export type RuleStatus = 'open' | 'practised' | 'done' | 'secured';

export type GrammarRule = {
  key: string;
  chapterId: string;
  chapterTitle: string;
  issue: string;
  explanation: string;
  theme: GrammarTheme;
  status: RuleStatus;
};

export type GrammarThemeGroup = { theme: GrammarTheme; rules: GrammarRule[] };

export function grammarOverview(
  direction: PairDirection,
  chapters: readonly LearningChapter[],
  finished: readonly string[],
  practised: Readonly<Record<string, readonly string[]>>,
  uiLanguage: UiLanguage,
  checks: Readonly<Record<string, CheckRecord>> = {}
): GrammarThemeGroup[] {
  const rules = chapters.flatMap((chapter): GrammarRule[] => {
    const translation = situationTranslation(chapter.situation, uiLanguage);
    // Schritt 4 jedes Kapitels ist seine Grammatik (`chapterSteps`).
    const grammarMode = chapterSteps(direction, chapter)[3][0];
    const status: RuleStatus = finished.includes(chapter.id)
      ? (checks[chapter.id]?.secured ? 'secured' : 'done')
      : (practised[chapter.id] ?? []).includes(grammarMode) ? 'practised' : 'open';
    return translation.corrections.map((hint, index) => ({
      key: `${chapter.id}#${index}`,
      chapterId: chapter.id,
      chapterTitle: translation.title,
      issue: hint.issue,
      explanation: hint.explanation,
      theme: ruleTheme(chapter.situation.id, index),
      status,
    }));
  });
  return GRAMMAR_THEMES
    .map((theme) => ({ theme, rules: rules.filter((rule) => rule.theme === theme) }))
    .filter((group) => group.rules.length > 0);
}
