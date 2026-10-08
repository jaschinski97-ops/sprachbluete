import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/lib/i18n';
import { LANGUAGE_CODES, type LanguageCode } from '@/lib/languages/types';
import {
  downloadPack,
  megabytes,
  refreshPack,
  removePack,
  updateAvailable,
  usePackStatus,
} from '@/lib/packs/state';

/**
 * Sprachpakete in den Einstellungen (nur im Sprachpaket-Build sichtbar):
 * je Lernsprache Stand, Laden/Aktualisieren und Entfernen. Hörclips und
 * Bilder kommen von GitHub Releases; der Lernstand liegt woanders und bleibt
 * beim Entfernen erhalten.
 */
export function LanguagePacksSection() {
  const { t } = useLocale();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('pack.intro')}
      </ThemedText>
      {LANGUAGE_CODES.map((language) => (
        <PackRow key={language} language={language} />
      ))}
    </ThemedView>
  );
}

function PackRow({ language }: { language: LanguageCode }) {
  const { t, languageName } = useLocale();
  const status = usePackStatus(language);
  useEffect(() => {
    void refreshPack(language);
  }, [language]);

  const name = languageName(language);
  const laeuft = status.phase === 'downloading' || status.phase === 'installing';
  const groesse = status.latest ? megabytes(status.latest.zipBytes) : null;
  const zustand =
    status.phase === 'downloading'
      ? t('pack.downloading', { percent: Math.round(status.progress * 100) })
      : status.phase === 'installing'
        ? t('pack.installing')
        : status.installed !== null
          ? t('pack.installed', { version: status.installed })
          : status.latest === null
            ? t('pack.unavailable')
            : t('pack.notInstalled');

  return (
    <View style={styles.row}>
      <View style={styles.texte}>
        <ThemedText type="default">{name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {zustand}
        </ThemedText>
        {status.phase === 'error' ? <ThemedText type="smallBold">{t('pack.failed')}</ThemedText> : null}
      </View>
      {status.installed === null || status.phase === 'error' ? (
        <ThemedButton
          variant="primary"
          disabled={laeuft || status.latest === null}
          accessibilityLabel={t('pack.downloadA11y', { language: name })}
          onPress={() => void downloadPack(language)}
          label={groesse ? t('pack.downloadSize', { size: groesse }) : t('pack.download')}
        />
      ) : (
        <View style={styles.knoepfe}>
          {updateAvailable(status) && groesse ? (
            <ThemedButton
              variant="primary"
              disabled={laeuft}
              accessibilityLabel={t('pack.updateA11y', { language: name })}
              onPress={() => void downloadPack(language)}
              label={t('pack.updateSize', { size: groesse })}
            />
          ) : null}
          <ThemedButton
            disabled={laeuft}
            accessibilityLabel={t('pack.removeA11y', { language: name })}
            onPress={() => void removePack(language)}
            label={t('pack.remove')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  texte: {
    flex: 1,
    minWidth: 140,
    gap: Spacing.half,
  },
  knoepfe: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
