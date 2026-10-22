import { ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground, GradientFill, Reveal } from './fx';
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
export function ScreenScaffold({ title, subtitle, headerAction, scrollRef, children }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {/* Aurora (22.10.2026) liegt fest hinter dem scrollenden Inhalt. */}
      <AuroraBackground />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Reveal style={styles.header}>
            {headerAction}
            <ThemedText type="subtitle">{title}</ThemedText>
            <View style={styles.titleBar}>
              <GradientBar />
            </View>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
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

/** Kurzer Leuchtstrich unter dem Seitentitel — Markenzeichen jeder Seite. */
function GradientBar() {
  const theme = useTheme();
  return (
    <View style={[styles.gradientBar, { boxShadow: `0 0 14px ${theme.gradientStart}` }]}>
      <GradientFill radius={2} />
    </View>
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
  gradientBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
});
