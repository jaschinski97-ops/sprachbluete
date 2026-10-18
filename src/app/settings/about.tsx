import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';

import { PersistenceWarning } from '@/components/settings-sections';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { languageDisplayName, useLocale } from '@/lib/i18n';
import { LANGUAGE_CODES } from '@/lib/languages/types';
import { activeVocabularyIds } from '@/data/active-vocabulary';

/**
 * „Über die App" (UI-Review 10.09.): Version, was an Lernmaterial drinsteckt
 * und wie es gespeichert ist — die Angaben, die auf der Einstellungsübersicht
 * nur Platz weggenommen hätten, weil man dort nichts an ihnen einstellt.
 */
export default function AboutScreen() {
  const { t, uiLanguage } = useLocale();
  const theme = useTheme();
  const version = Constants.expoConfig?.version;

  return (
    <ScreenScaffold title={t('settings.about')}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.dismissTo('/settings')}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={16} color={theme.textSecondary} accessible={false} />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.back')}
        </ThemedText>
      </Pressable>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('settings.version', { version: version ?? '—' })}</ThemedText>
        <ThemedText type="small">
          {t('settings.materialCount', { count: activeVocabularyIds().size, languages: LANGUAGE_CODES.map(code => languageDisplayName(code, uiLanguage)).join(', ') })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.materialBody')}
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('settings.local')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.storageBody')}
        </ThemedText>
      </ThemedView>

      {/* Läuft die App auf dem Notfallspeicher, steht die Warnung hier statt
          in der Karte — sie ist ein eigener Zustand, kein Beiwerk. */}
      <PersistenceWarning />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
