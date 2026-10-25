import { ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BrushStroke, Reveal, textGlow, useSvgId } from './fx';
import { SakuraBackground, type SzenenArt } from './sakura-scenes';
import { ThemedText } from './themed-text';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  subtitle?: string;
  /**
   * Kleine Aktion über dem Titel (z. B. „← Zur Übersicht" im Lern-Reiter).
   * Eigener Zeilenanfang statt Position im Titel: Sie bleibt lesbar, ohne
   * dass Screens ihre Überschrift dafür umbauen müssen.
   */
  headerAction?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  /** Kirschblüten-Motiv dieses Bildschirms (jeder Reiter hat sein eigenes). */
  szene?: SzenenArt;
  /**
   * Während einer Übung: Die Szene steht still und tritt weiter zurück
   * (25.10.2026). Spart Akku und lässt Aufgaben und Antworten lesbar.
   */
  ruhig?: boolean;
  children?: ReactNode;
};

/**
 * Shared page frame. Centres content and caps its width so the same screens
 * read well on a phone and in a wide desktop browser window (see PROGRESS.md,
 * Phase 0 responsive requirement) instead of stretching edge to edge.
 *
 * Der Hintergrund wird hier bewusst gemalt (UI-Review 2026-09-09): Im
 * Web-Build ist sonst die Fläche unter dem Inhalt transparent, und im
 * Dunkelmodus stand die helle Überschrift auf dem weißen Browser-Canvas.
 */
export function ScreenScaffold({ title, subtitle, headerAction, scrollRef, szene, ruhig = false, children }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {/* Kirschblüten-Szene (23.10.2026) liegt fest hinter dem scrollenden Inhalt. */}
      <SakuraBackground szene={szene} ruhig={ruhig} />
      <Schleier staerke={ruhig ? 0.78 : 0.5} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Reveal style={styles.header}>
            {headerAction}
            {/* Schatten in der Grundfarbe: Der Titel bleibt über den Blüten lesbar. */}
            <ThemedText type="subtitle" style={textGlow(theme.background, 10)}>
              {title}
            </ThemedText>
            <View style={styles.titleBar}>
              <BrushStroke />
            </View>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary" style={textGlow(theme.background, 10)}>
                {subtitle}
              </ThemedText>
            ) : null}
          </Reveal>
          <Reveal index={1} style={styles.body}>
            {children}
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Sanfter Schleier in der Grundfarbe zwischen Szene und Inhalt (25.10.2026).
 * Testrunde: Blütenzweige lagen unter Untertiteln, „Karte 1 von 20“ und dem
 * Stufen-Reiter und machten sie schwer lesbar. Der Schleier deckt die
 * Inhaltsspalte ab und läuft zu den Rändern aus, dort bleibt die Szene voll
 * sichtbar. Auf schmalen Geräten bleiben je rund 12 % Rand frei sichtbar.
 */
function Schleier({ staerke }: { staerke: number }) {
  const theme = useTheme();
  const id = useSvgId('schleier');
  const { width } = useWindowDimensions();
  const spalte = Math.min(width, MaxContentWidth + Spacing.three * 2);
  const rand = Math.max(0, (width - spalte) / 2) / Math.max(1, width);
  // Breit: Der Übergang liegt AUSSERHALB der Spalte, sie ist ganz abgedeckt.
  // Schmal (Spalte = Bildschirm): Übergang auf den äußeren 12 %.
  const breit = rand > 0.04;
  const aussen = breit ? Math.max(0, rand - 0.06) : 0;
  const innen = breit ? rand + 0.01 : 0.12;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset={aussen} stopColor={theme.background} stopOpacity={0} />
          <Stop offset={innen} stopColor={theme.background} stopOpacity={staerke} />
          <Stop offset={1 - innen} stopColor={theme.background} stopOpacity={staerke} />
          <Stop offset={1 - aussen} stopColor={theme.background} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.five,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  /** Der Inhalt behält den Abstand seiner Kinder wie zuvor die Spalte. */
  body: {
    gap: Spacing.four,
  },
  titleBar: {
    marginTop: Spacing.half,
    marginBottom: Spacing.one,
  },
});
