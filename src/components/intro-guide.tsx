import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { GradientFill } from './fx';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type TranslationKey, useLocale } from '@/lib/i18n';
import { closeIntro, showIntroOnFirstStart, useIntroVisible } from '@/lib/intro';

type Page = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: TranslationKey;
  body: TranslationKey;
};

/** Vier kurze Seiten: Sprache wählen, roter Faden, wenig Zeit, mehr Zeit. */
export const INTRO_PAGES: readonly Page[] = [
  { icon: 'flower-outline', title: 'intro.welcomeTitle', body: 'intro.welcomeBody' },
  { icon: 'map-outline', title: 'intro.pathTitle', body: 'intro.pathBody' },
  { icon: 'timer-outline', title: 'intro.shortTitle', body: 'intro.shortBody' },
  { icon: 'layers-outline', title: 'intro.longTitle', body: 'intro.longBody' },
];

/**
 * Die Einführung (24.10.2026). Geht beim ersten Start von selbst auf und
 * lässt sich unter Einstellungen → Einführung wieder öffnen.
 */
export function IntroGuide() {
  const visible = useIntroVisible();
  const theme = useTheme();
  const { t } = useLocale();
  const [page, setPage] = useState(0);

  useEffect(() => {
    void showIntroOnFirstStart();
  }, []);

  // Beim Schließen zurück auf Seite 1, damit sie beim nächsten Öffnen vorn beginnt.
  const close = () => {
    setPage(0);
    void closeIntro();
  };

  if (!visible) return null;
  const current = INTRO_PAGES[page]!;
  const last = page === INTRO_PAGES.length - 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: `${theme.background}e6` }]}>
        <View
          style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder }]}
          accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.icon}>
              <GradientFill radius={28} />
              <Ionicons name={current.icon} size={28} color={theme.gradientText} />
            </View>
            <ThemedText type="subtitle" accessibilityRole="header">{t(current.title)}</ThemedText>
            <ThemedText style={styles.body}>{t(current.body)}</ThemedText>
          </ScrollView>

          <View style={styles.dots} accessibilityLabel={t('intro.pageOf', { page: page + 1, total: INTRO_PAGES.length })}>
            {INTRO_PAGES.map((item, index) => (
              <View
                key={item.title}
                style={[styles.dot, { backgroundColor: index === page ? theme.gradientStart : theme.cardBorder }]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {page > 0 ? (
              <ThemedButton label={t('common.back')} onPress={() => setPage(page - 1)} />
            ) : (
              <ThemedButton label={t('intro.skip')} onPress={close} />
            )}
            <ThemedButton
              label={last ? t('intro.done') : t('common.next')}
              variant="primary"
              onPress={() => (last ? close() : setPage(page + 1))}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    borderRadius: Spacing.four,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  content: {
    gap: Spacing.three,
  },
  icon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
