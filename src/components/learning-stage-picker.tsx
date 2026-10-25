import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import { LEARNING_STAGES, STAGE_KEYS, type LearningStage } from '@/lib/learning-stages';

/** Anfänger · Fortgeschritten · Profi als Segment-Schalter (Lernen, Gespräch, Studio).
 *
 * Steuerbar von außen (`value`/`onChange`); `counts` zeigt optional die Anzahl Inhalte je Stufe unter dem Namen.
 * Barrierefrei als Radiogruppe: jedes Segment ist ein `radio` mit `selected`-Zustand und mindestens 44 px Höhe.
 */
export function LearningStagePicker({ value, onChange, disabled = false, counts }: {
  value: LearningStage;
  onChange: (value: LearningStage) => void;
  disabled?: boolean;
  /** Optional: Anzahl Inhalte je Stufe, steht klein unter dem Namen. */
  counts?: Partial<Record<LearningStage, number>>;
}) {
  const { t } = useLocale();
  const colors = useTheme();
  return (
    <View role="radiogroup" accessibilityLabel={t('level.choose')} style={[styles.row, { borderColor: colors.backgroundSelected }]}>
      {LEARNING_STAGES.map((stage) => {
        const selected = stage === value;
        return (
          <Pressable
            key={stage}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(stage)}
            style={({ pressed }) => [
              styles.segment,
              { backgroundColor: selected ? colors.accent : 'transparent' },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: selected ? colors.accentText : colors.text, textAlign: 'center' }}>
              {t(STAGE_KEYS[stage])}
            </ThemedText>
            {counts ? (
              <ThemedText type="small" style={{ color: selected ? colors.accentText : colors.textSecondary, textAlign: 'center' }}>
                {counts[stage] ?? 0}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  pressed: { opacity: 0.7 },
});
