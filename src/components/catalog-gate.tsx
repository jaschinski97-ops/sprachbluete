import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenScaffold } from './screen-scaffold';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useCatalogLanguages } from '@/hooks/use-catalog-languages';
import { ensureLanguages } from '@/lib/content/catalog-languages';
import { isSplitCatalog } from '@/lib/content/catalog-state';
import { useLocale } from '@/lib/i18n';
import type { LanguageCode } from '@/lib/languages/types';
import { startupLanguage } from '@/lib/startup-language';

/**
 * Ladetor beim Start (Katalog je Lernsprache): Solange die Sprachdatei der
 * Lernsprache lädt, rendert es nichts — der native Splash bleibt stehen, weil
 * `AnimatedSplashOverlay` ihn erst beim ersten Layout ausblendet. Scheitert
 * das Laden (Datei fehlt, kaputt, länger als 10 s), blendet es den Splash aus
 * und zeigt einen Fehler mit „Erneut versuchen“: nie ein ewiger Splash, nie
 * eine still leere App. Im Entwicklungsbau ist das Tor sofort offen.
 */
export function CatalogGate({ children }: { children: ReactNode }) {
  const { uiLanguage } = useLocale();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(() => (isSplitCatalog() ? 'loading' : 'ready'));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSplitCatalog()) return;
    let cancelled = false;
    const started = Date.now();
    startupLanguage(uiLanguage)
      .then((language) => ensureLanguages([language]))
      .then(
        () => {
          console.log(`[catalog] Ladetor offen nach ${Date.now() - started} ms`);
          if (!cancelled) setState('ready');
        },
        (error: unknown) => {
          console.warn('[catalog] Ladetor:', error);
          if (!cancelled) setState('error');
          SplashScreen.hideAsync().catch(() => {});
        }
      );
    return () => {
      cancelled = true;
    };
    // Nur beim Start und nach „Erneut versuchen“: Danach laden Übersicht und
    // Reiter selbst, was sie brauchen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (state === 'ready') return <>{children}</>;
  if (state === 'loading') return null;
  return (
    <ThemedView style={styles.screen}>
      <CatalogLoadFailed
        onRetry={() => {
          setState('loading');
          setAttempt((value) => value + 1);
        }}
      />
    </ThemedView>
  );
}

function CatalogLoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <View style={styles.failed} accessibilityRole="alert">
      <ThemedText type="small" themeColor="textSecondary">
        {t('catalog.loadFailed')}
      </ThemedText>
      <ThemedButton label={t('common.retry')} variant="primary" onPress={onRetry} />
    </View>
  );
}

/**
 * Für Bildschirme mit eigener Lernsprache (Lern-, Gesprächs-, Fortschritts-
 * Reiter): hält die Sprache geladen und zeigt bis dahin einen Ladehinweis.
 */
export function CatalogLanguages({
  languages,
  title,
  subtitle,
  headerAction,
  children,
}: {
  languages: readonly LanguageCode[];
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const { ready, error, retry } = useCatalogLanguages(languages);
  if (ready) return <>{children}</>;
  return (
    <ScreenScaffold title={title} subtitle={subtitle} headerAction={headerAction}>
      {error ? (
        <CatalogLoadFailed onRetry={retry} />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('catalog.loading')}
        </ThemedText>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  failed: {
    gap: Spacing.three,
  },
});
