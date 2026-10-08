import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { LanguagePacksSection } from '@/components/language-packs-section';
import { SettingsRow } from '@/components/settings-row';
import {
  AppLanguageSection,
  BackupSection,
  PersistenceWarning,
} from '@/components/settings-sections';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { SYSTEM_LANGUAGE_SETTING, useLocale } from '@/lib/i18n';
import { settingsLanguageName } from '@/lib/i18n/settings-language-names';
import { packsNeeded } from '@/lib/packs/state';

type Offen = null | 'sprache' | 'pakete' | 'sicherung';

/**
 * Einstellungen als kompakte Zeilen (UI-Review 10.09.): Bezeichnung links,
 * aktueller Wert rechts, Pfeil — Erklärungen und Formulare erscheinen erst
 * beim Öffnen. Vorher war diese Seite eine lange Folge von Infokarten und
 * Formularen, deren Übersicht niemand brauchte.
 *
 * Das Entwicklerstudio steht hier nur im Entwicklungsbau (`__DEV__`) und ist
 * ein eigener Bereich (`settings/studio`); in der installierten App taucht
 * weder der Eintrag noch eines seiner Wörter auf.
 *
 * Die Untertitel-Zeile „Dein Lernbegleiter" ist entfallen — sie half bei
 * keiner Entscheidung.
 */
export default function SettingsScreen() {
  const { t, setting } = useLocale();
  const [offen, setOffen] = useState<Offen>(null);
  const version = Constants.expoConfig?.version;

  const sprachWert =
    setting === SYSTEM_LANGUAGE_SETTING
      ? t('appLanguage.system')
      : settingsLanguageName(setting);

  const umschalten = (was: Exclude<Offen, null>) =>
    setOffen((aktuell) => (aktuell === was ? null : was));

  return (
    <ScreenScaffold title={t('tabs.settings')}>
      <PersistenceWarning />

      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.general')}
      </ThemedText>
      <View style={styles.gruppe}>
        <SettingsRow
          title={t('appLanguage.title')}
          value={sprachWert}
          icon="language-outline"
          expanded={offen === 'sprache'}
          onPress={() => umschalten('sprache')}
        />
        {/* Nur im Sprachpaket-Build: Hörclips und Bilder je Lernsprache laden. */}
        {packsNeeded() ? (
          <SettingsRow
            title={t('pack.title')}
            icon="cloud-download-outline"
            expanded={offen === 'pakete'}
            onPress={() => umschalten('pakete')}
          />
        ) : null}
        <SettingsRow
          title={t('settings.backupTitle')}
          detail={t('settings.backupSummary')}
          icon="save-outline"
          expanded={offen === 'sicherung'}
          onPress={() => umschalten('sicherung')}
        />
        <SettingsRow
          title={t('settings.about')}
          value={version ? t('settings.version', { version }) : undefined}
          icon="information-circle-outline"
          onPress={() => router.push('/settings/about')}
        />
      </View>
      {offen === 'sprache' ? <AppLanguageSection /> : null}
      {offen === 'pakete' ? <LanguagePacksSection /> : null}
      {offen === 'sicherung' ? <BackupSection /> : null}

      {__DEV__ ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('settings.development')}
          </ThemedText>
          <View style={styles.gruppe}>
            <SettingsRow
              title={t('settings.studio')}
              detail={t('settings.studioSummary')}
              icon="construct-outline"
              onPress={() => router.push('/settings/studio')}
            />
          </View>
        </>
      ) : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  gruppe: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
    gap: 1,
  },
});
