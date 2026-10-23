import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Reveal, textGlow } from './fx';
import { ThemedText, displayLineHeight } from './themed-text';
import { STRESS_RULE_KEYS } from './feature-legend';

import { Spacing } from '@/constants/theme';
import { Tone } from '@/constants/tones';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import { learningLanguage } from '@/lib/languages/definitions';
import { LanguageCode } from '@/lib/languages/types';
import { analyzeStress } from '@/lib/stress/syllables';

/**
 * Der Gruß der GELEHRTEN Sprache (Nutzerwunsch 13.09.: „den Spruch auf die
 * Sprache anpassen"). Thai hat eine handgeprüfte Marke (Silbenschnitt mit
 * Tonfarben — Bindekonsonanten lassen sich aus Daten nicht zuverlässig
 * teilen); alle anderen Sprachen lesen ihren Gruß aus `definitions.ts`.
 */
const THAI_SEGMENTS: { text: string; tone: Tone }[] = [
  { text: 'สวัส', tone: 'low' },
  { text: 'ดี', tone: 'mid' },
];

const THAI_SYLLABLES: { text: string; tone: Tone }[] = [
  { text: 'sà', tone: 'low' },
  { text: 'wàt', tone: 'low' },
  { text: 'dii', tone: 'mid' },
];

/**
 * Identity-Hero der Übersicht: Der Gruß der GELEHRTEN Sprache, groß und mit
 * ihrem Merkmal — Töne bei Thai, Betonung bei Spanisch, Lautschrift bei
 * Englisch, der deutsche Gruß schlicht als Wort.
 */
export function LanguageHero({ language }: { language: LanguageCode }) {
  if (learningLanguage(language).script === 'thai') return <ThaiHero />;
  return <GrussHero language={language} />;
}

/** Färbt die Tonfarben-Balken und Umschrift der Thai-Marke (unverändert). */
function ThaiHero() {
  const toneColor = useToneColor();
  const theme = useTheme();

  return (
    // EINE Ansage fürs Ganze: Wort und Umschrift sind zusammen ein Inhalt.
    // Balken und Trennpunkte sind Dekor und bleiben dem Screenreader verborgen.
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="สวัสดี — sà wàt dii"
      importantForAccessibility="no-hide-descendants"
      style={styles.wrapper}>
      {/* Seit 22.10.2026: Die Silben federn nacheinander herein und leuchten
          in ihrer Tonfarbe. */}
      <View style={styles.word}>
        {THAI_SEGMENTS.map((segment, index) => (
          <Reveal key={segment.text} index={index + 1} style={styles.segment}>
            <ThemedText
              maxFontSizeMultiplier={1.4}
              style={[
                styles.thai,
                {
                  color: toneColor(segment.tone),
                  lineHeight: displayLineHeight(64, 1.4),
                },
                textGlow(toneColor(segment.tone), 22),
              ]}>
              {segment.text}
            </ThemedText>
            <View
              style={[
                styles.bar,
                { backgroundColor: toneColor(segment.tone), boxShadow: `0 0 10px ${toneColor(segment.tone)}` },
              ]}
            />
          </Reveal>
        ))}
      </View>

      <View style={styles.translit}>
        {THAI_SYLLABLES.map((syllable, index) => (
          <Reveal key={syllable.text} index={index + 3} style={styles.translitItem}>
            {index > 0 ? (
              <ThemedText style={[styles.sep, { color: theme.decorGrey }]}>·</ThemedText>
            ) : null}
            <ThemedText
              maxFontSizeMultiplier={1.4}
              style={[styles.translitText, { color: toneColor(syllable.tone) }]}>
              {syllable.text}
            </ThemedText>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

/**
 * Der lateinisch geschriebene Gruß — Wort groß, eine kleine Merkhilfe unten.
 * Spanisch markiert die betonte Silbe (Regeltext als Merkhilfe), Englisch
 * zeigt nur die Lautschrift: Betonungsregeln sind das Merkmal von Spanisch,
 * nicht von Englisch — dessen Merkhilfe ist die Aussprache.
 */
function GrussHero({ language }: { language: LanguageCode }) {
  const { t } = useLocale();
  const theme = useTheme();
  const definition = learningLanguage(language);

  const gruss = useMemo(() => {
    const { word, hint } = definition.greeting;
    // Sprachen mit Betonungsmerkmal markieren die betonte Silbe (nur
    // mehrsilbige Wörter haben eine); der Regeltext ist dann die Merkhilfe.
    if (definition.legend === 'stress') {
      const analyse = analyzeStress(word);
      if (analyse.ok && analyse.rule !== 'monosyllable') {
        return {
          wort: word,
          silben: analyse.syllables,
          betont: analyse.stressedIndex,
          hilfe: t(STRESS_RULE_KEYS[analyse.rule].label) as string,
        };
      }
    }
    return { wort: word, silben: null as string[] | null, betont: -1, hilfe: hint };
    // Die Regelhilfe steht in der UI-Sprache — ein Sprachwechsel baut neu.
  }, [definition, t]);

  if (!gruss) return <ThaiHero />;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={gruss.silben ? `${gruss.wort} — ${gruss.silben.join('·')}` : gruss.wort}
      importantForAccessibility="no-hide-descendants"
      style={styles.wrapper}>
      <Reveal index={1}>
      <ThemedText
        maxFontSizeMultiplier={1.4}
        style={[styles.latin, { lineHeight: displayLineHeight(56, 1.4) }, textGlow(theme.gradientStart, 26)]}>
        {gruss.silben
          ? gruss.silben.map((silbe, index) => (
              <ThemedText
                key={index}
                style={[styles.latin, index === gruss.betont && styles.betont]}>
                {silbe}
              </ThemedText>
            ))
          : gruss.wort}
      </ThemedText>
      </Reveal>
      {gruss.hilfe ? (
        <Reveal index={2}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hilfe}>
            {gruss.hilfe}
          </ThemedText>
        </Reveal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
  },
  word: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  segment: {
    // Streckt den Tonfarben-Balken auf die Breite seines eigenen Segments.
    alignItems: 'stretch',
  },
  thai: {
    fontSize: 64,
    fontWeight: '600',
  },
  /** Lateinische Grußwörter etwas kleiner als die Thai-Schrift. */
  latin: {
    fontSize: 56,
    fontWeight: '600',
  },
  /** Die betonte Silbe — wie im Legendenmuster: fett und unterstrichen. */
  betont: {
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  bar: {
    height: 3,
    borderRadius: 2,
    marginTop: Spacing.half,
  },
  hilfe: {
    marginTop: Spacing.one,
  },
  translit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  translitItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  translitText: {
    fontSize: 20,
    fontWeight: '500',
  },
  sep: {
    fontSize: 20,
    marginHorizontal: Spacing.two,
  },
});
