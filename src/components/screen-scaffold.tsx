import { ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.header}>
            {headerAction}
            <ThemedText type="subtitle">{title}</ThemedText>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {children}
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
});
