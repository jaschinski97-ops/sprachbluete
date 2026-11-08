import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CheckRecord } from '@/lib/chapter-recheck';
import { grammarOverview, THEME_KEYS, type GrammarTheme, type RuleStatus } from '@/lib/grammar-overview';
import { type TranslationKey, useLocale } from '@/lib/i18n';
import type { PairDirection } from '@/lib/languages/types';
import type { LearningChapter } from '@/lib/learning-path';
import { STAGE_KEYS, stageForLevel, type LearningStage } from '@/lib/learning-stages';

const STATUS_KEYS: Record<RuleStatus, TranslationKey> = {
  open: 'grammarRules.statusOpen',
  practised: 'grammarRules.statusPractised',
  done: 'grammarRules.statusDone',
  secured: 'grammarRules.statusSecured',
};

/**
 * „Alle Regeln“ im Bereich Grammatik (08.11.2026): die Regeln der Dialoge
 * der gewählten Stufe nach Themen. Jede Regel zeigt, ob ihr Kapitel sie
 * schon geübt hat, und führt mit einem Tipp dorthin.
 */
export function GrammarOverview({
  direction,
  chapters,
  finished,
  practised,
  checks,
  stage,
  onOpenChapter,
}: {
  direction: PairDirection;
  chapters: readonly LearningChapter[] | null;
  finished: readonly string[];
  practised: Readonly<Record<string, readonly string[]>>;
  checks: Readonly<Record<string, CheckRecord>>;
  stage: LearningStage;
  onOpenChapter: (chapterId: string) => void;
}) {
  const { t, uiLanguage } = useLocale();
  const colors = useTheme();
  const [open, setOpen] = useState<GrammarTheme | null>(null);
  const groups = useMemo(() => {
    const own = (chapters ?? []).filter((chapter) => stageForLevel(chapter.situation.level) === stage);
    return grammarOverview(direction, own, finished, practised, uiLanguage, checks);
  }, [chapters, direction, finished, practised, stage, uiLanguage, checks]);

  if (chapters === null) {
    return <ThemedText type="small" themeColor="textSecondary">{t('round.assembling')}</ThemedText>;
  }

  return (
    <View style={styles.list}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('grammarRules.intro', { stage: t(STAGE_KEYS[stage]) })}
      </ThemedText>
      {groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">{t('grammarRules.empty')}</ThemedText>
      ) : null}
      {groups.map((group) => {
        const expanded = open === group.theme;
        // Gezählt wird, was bestanden ist — ein geöffneter Schritt ist noch kein Können.
        const done = group.rules.filter((rule) => rule.status === 'done' || rule.status === 'secured').length;
        return (
          <ThemedView key={group.theme} type="backgroundElement" style={styles.theme}>
            <Pressable
              onPress={() => setOpen(expanded ? null : group.theme)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${t(THEME_KEYS[group.theme])}, ${t('grammarRules.progress', { done, total: group.rules.length })}`}
              style={({ pressed }) => [styles.themeHead, pressed && styles.pressed]}>
              <View style={styles.themeText}>
                <ThemedText type="smallBold">{t(THEME_KEYS[group.theme])}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('grammarRules.progress', { done, total: group.rules.length })}
                </ThemedText>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>
            {expanded ? group.rules.map((rule) => (
              <ThemedView key={rule.key} type="background" style={styles.rule}>
                <View style={styles.ruleHead}>
                  <ThemedText type="smallBold" style={styles.flex}>{rule.issue}</ThemedText>
                  <ThemedText
                    type="small"
                    themeColor={rule.status === 'done' || rule.status === 'secured' ? 'accent' : 'textSecondary'}>
                    {t(STATUS_KEYS[rule.status])}
                  </ThemedText>
                </View>
                <ThemedText type="small">{rule.explanation}</ThemedText>
                <View style={styles.ruleFoot}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    {t('grammarRules.from', { title: rule.chapterTitle })}
                  </ThemedText>
                  <ThemedButton label={t('grammarRules.toChapter')} onPress={() => onOpenChapter(rule.chapterId)} />
                </View>
              </ThemedView>
            )) : null}
          </ThemedView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  theme: {
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  themeHead: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  themeText: {
    flex: 1,
    gap: 2,
  },
  rule: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  ruleFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
    minWidth: 120,
  },
  pressed: {
    opacity: 0.7,
  },
});
