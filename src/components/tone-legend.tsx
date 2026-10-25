import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { ToneContour } from './tone-contour';

import { Spacing } from '@/constants/theme';
import { TONE_KEYS, TONES } from '@/constants/tones';
import { useToneColor } from '@/hooks/use-theme';
import { TranslationKey, useLocale } from '@/lib/i18n';

/** Die fünf Tonnamen als Übersetzungsschlüssel (constants/tones bleibt unverändert). */
const TONE_NAME_KEYS: Record<string, TranslationKey> = {
  mid: 'tone.mid',
  low: 'tone.low',
  falling: 'tone.falling',
  high: 'tone.high',
  rising: 'tone.rising',
};

/**
 * Die fünf Grundtöne mit Kontur, Farbe und dem Tonzeichen der Umschrift.
 *
 * `compact` lässt die Erklärtexte weg — für die Lernansicht, wo die Legende
 * nur als Erinnerung dient.
 */
export function ToneLegend({ compact = false }: { compact?: boolean }) {
  const toneColor = useToneColor();
  const { t } = useLocale();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('legend.toneTitle')}</ThemedText>
      {!compact ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('legend.toneBody')}
        </ThemedText>
      ) : null}
      <View style={styles.row}>
        {TONE_KEYS.map((tone) => (
          <View key={tone} style={styles.item}>
            <ToneContour tone={tone} height={13} />
            <View>
              <ThemedText type="small" style={{ color: toneColor(tone) }}>
                {t(TONE_NAME_KEYS[tone])}
              </ThemedText>
              {!compact ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {TONES[tone].roman}
                </ThemedText>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
