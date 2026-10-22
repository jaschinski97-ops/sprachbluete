import { ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrushStroke, Reveal } from './fx';
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
export function ScreenScaffold({ title, subtitle, headerAction, scrollRef, szene, children }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {/* Kirschblüten-Szene (23.10.2026) liegt fest hinter dem scrollenden Inhalt. */}
      <SakuraBackground szene={szene} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Reveal style={styles.header}>
            {headerAction}
            {/* Schatten in der Grundfarbe: Der Titel bleibt über den Blüten lesbar. */}
            <ThemedText type="subtitle" style={[styles.lesbar, { textShadowColor: theme.background }]}>
              {title}
            </ThemedText>
            <View style={styles.titleBar}>
              <BrushStroke />
            </View>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary" style={[styles.lesbar, { textShadowColor: theme.background }]}>
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
  lesbar: {
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
