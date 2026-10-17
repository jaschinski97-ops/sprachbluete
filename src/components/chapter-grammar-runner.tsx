import { useState } from 'react';
import type { ConversationSituation } from '@/lib/conversation/types';
import { situationTranslation, spokenText } from '@/lib/conversation/types';
import type { DrillId } from '@/lib/drills/types';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { useLocale } from '@/lib/i18n';
import { DrillRunner } from './drill-runner';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Teach the rules that actually occur in this chapter, then practise the
 * chapter's grammar drill. Until 17.10.2026 the practice was the scene's
 * role play — the same exercise as step 7, with no task on the rule itself.
 */
export function ChapterGrammarRunner({ situation, direction, drill, onExit }: {
  situation: ConversationSituation; direction: PairDirection; drill: DrillId; onExit: () => void;
}) {
  const { t, uiLanguage } = useLocale();
  const [practising, setPractising] = useState(false);
  const translation = situationTranslation(situation, uiLanguage);
  if (practising) return <DrillRunner drill={drill} direction={direction} language={targetLanguageOf(direction)} onExit={onExit} />;
  return <ThemedView type="backgroundElement" style={{ padding: Spacing.three, gap: Spacing.three, borderRadius: Spacing.three }}>
    <ThemedText type="small">{t('path.grammar')}</ThemedText>
    {translation.corrections.map((hint, index) => <ThemedView key={index}>
      <ThemedText type="smallBold">{hint.issue}</ThemedText>
      <ThemedText>{hint.explanation}</ThemedText>
    </ThemedView>)}
    <ThemedText type="small">{t('learning.example')}</ThemedText>
    {situation.scriptTurns.slice(0, 2).map((turn, index) => <ThemedView key={index}>
      <ThemedText>{spokenText(situation, turn)}</ThemedText>
      {/* Thai-Zieltexte immer mit Umschrift, wie überall (Testlauf 08.10.2026). */}
      {targetLanguageOf(direction) === 'th' && turn.roman ? <ThemedText type="small" themeColor="textSecondary">{turn.roman}</ThemedText> : null}
      <ThemedText type="small">{translation.turns[index]}</ThemedText>
    </ThemedView>)}
    <ThemedButton label={t('common.next')} onPress={() => setPractising(true)} variant="primary" />
  </ThemedView>;
}
