import { StyleSheet, View } from 'react-native';

import { ThaiWord } from './thai-word';
import { ThemedText, displayLineHeight } from './themed-text';

import { Spacing } from '@/constants/theme';
import { syllablesOf } from '@/data/vocab-helpers';
import { VocabEntry } from '@/data/vocab-types';
import { useLocale } from '@/lib/i18n';
import { learningLanguage } from '@/lib/languages/definitions';

/**
 * Das fremdsprachige Wort mit seiner Auszeichnung (Phase 16).
 *
 * BIS PHASE 15 GAB ES NUR `ThaiWord`, und der Karteikasten rief ihn direkt
 * auf. Mit drei Sprachen geht das nicht mehr: Ein spanisches Wort hat keine
 * Töne, und ein englisches nicht einmal Silben. Diese Datei verteilt auf die
 * jeweils richtige Darstellung.
 *
 * KEIN ZWEITES DARSTELLUNGSSYSTEM (Pflicht 3 aus Phase 15). Die Tonfarben
 * bleiben, wo sie waren — `ThaiWord` ist unverändert und liest weiter aus
 * `constants/tones.ts`. Was hier dazukommt, ist die Darstellung **anderer**
 * Merkmale, nicht eine zweite Darstellung desselben:
 *
 *   Spanisch — die betonte Silbe wird hervorgehoben. Bewusst über Schriftschnitt
 *     und Unterstreichung und **nicht** über eine neue Farbe: Eine Farbe müsste
 *     die Kontrastprüfung aus Phase 9 bestehen und stünde neben fünf Tonfarben,
 *     die etwas ganz anderes bedeuten.
 *   Englisch — die Lautschrift unter dem Wort. Es gibt nichts silbenweise
 *     auszuzeichnen, weil das Merkmal am ganzen Wort hängt (AE-44).
 */
export function TermWord({
  entry,
  size = 'large',
}: {
  entry: VocabEntry;
  size?: 'large' | 'medium';
}) {
  const { t } = useLocale();
  // Sprachen mit Tonfarben (Thai) bekommen die Silben-Tonfarben-Darstellung.
  if (learningLanguage(entry.language).legend === 'tones') return <ThaiWord entry={entry} size={size} />;

  const syllables = syllablesOf(entry);
  // Einsilbler: Sowohl die Silbenzeile (sie würde das Wort wiederholen)
  // als auch „betont: X“ (bei einer Silbe keine Information) entfallen —
  // vorher stand „diez“ doppelt untereinander (Nutzerbefunde 21.09.).
  const showsStress = syllables.some((syllable) => syllable.stressed) && syllables.length > 1;
  // Wie bei `ThaiWord`: sehr große Fassung begrenzt, mittlere großzügiger;
  // Zeilenhöhe wächst mit (UI-Review 2026-09-07). Die Größen selbst bleiben
  // bewusst eigene Stufen — lateinische Schrift braucht weniger Kopffreiheit
  // als Thai, die Skala sieht dafür eigene `thai*`-Varianten vor.
  const base = size === 'large' ? 44 : 28;
  const cap = size === 'large' ? 1.4 : 2;

  return (
    <View style={styles.wrapper}>
      <ThemedText
        maxFontSizeMultiplier={cap}
        style={[
          size === 'large' ? styles.termLarge : styles.termMedium,
          { lineHeight: displayLineHeight(base, cap, size === 'large' ? 1.4 : 1.42) },
        ]}>
        {entry.term}
      </ThemedText>

      {showsStress ? (
        <View style={styles.syllables}>
          {syllables.map((syllable, index) => (
            <View key={`${syllable.roman}-${index}`} style={styles.syllable}>
              <ThemedText
                type={size === 'large' ? 'default' : 'small'}
                style={syllable.stressed ? styles.stressed : null}>
                {syllable.roman}
              </ThemedText>
              {index < syllables.length - 1 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  ·
                </ThemedText>
              ) : null}
            </View>
          ))}
        </View>
      ) : (entry.ipa ?? entry.romanization) !== entry.term ? (
        <ThemedText type="small" themeColor="textSecondary">
          {entry.ipa ?? entry.romanization}
        </ThemedText>
      ) : null}
      {entry.language === 'de' || entry.language === 'en' ? <ThemedText type="small" themeColor="textSecondary">
        {t('learning.pronunciation')}
      </ThemedText> : null}

      {showsStress ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('termWord.stressed', { syllable: syllables.find((syllable) => syllable.stressed)?.roman ?? '' })}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  termLarge: {
    fontSize: 44,
    fontWeight: '600',
    textAlign: 'center',
  },
  termMedium: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  syllables: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  syllable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  /** Fett und unterstrichen - zwei Merkmale, damit es auch ohne Farbe traegt. */
  stressed: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
