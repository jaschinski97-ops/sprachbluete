import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  SYSTEM_LANGUAGE_SETTING,
  UI_LANGUAGES,
  localeTagFor,
  useLocale,
  type LanguageSetting,
  type TranslationKey,
} from '@/lib/i18n';
import { settingsLanguageName } from '@/lib/i18n/settings-language-names';
import { Spacing } from '@/constants/theme';
import {
  BackupError,
  BackupImportSummary,
  chooseBackupFile,
  exportBackup,
  restoreBackup,
} from '@/lib/backup';
import {
  BEFORE_RESTORE_FILE,
  listLocalBackups,
  restoreLocalBackup,
  writeLocalBackup,
  type LocalBackup,
} from '@/lib/local-backup';
import { dayKey } from '@/lib/review-log';
import { isStorageDegraded } from '@/lib/storage';
import { useTheme } from '@/hooks/use-theme';
import { saveErscheinung, useErscheinung, type Erscheinung } from '@/lib/appearance';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedButton } from '@/components/themed-button';

type StatusMessage = { kind: 'success' | 'error'; text: string };

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

function messageOf(error: unknown, t: Translate): string {
  // Sicherungsfehler tragen einen Schlüssel; ihr `message` ist nur deutsch.
  if (error instanceof BackupError) return t(error.key, error.params);
  return error instanceof Error ? error.message : t('common.unknownError');
}

function formatSummary(summary: BackupImportSummary, t: Translate, localeTag: string): string {
  const parts = [
    t('backup.partsCards', { cards: summary.cards }),
    t('backup.partsLog', { days: summary.logEntries }),
  ];
  if (summary.profileApplied) parts.push(t('backup.partsProfile'));
  if (summary.chapters !== null) parts.push(t('backup.partsChapters', { chapters: summary.chapters }));
  const when = summary.exportedAt
    ? new Date(summary.exportedAt).toLocaleDateString(localeTag)
    : null;
  // Mit Leerzeichen verbunden: 16 Sprachen führen „fromDate“ ohne
  // führendes Leerzeichen, dann klebte „… .(Sicherung vom …)“ zusammen.
  return [t('backup.applied', { parts: parts.join(', ') }), when ? t('backup.fromDate', { date: when }) : '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Die Bestätigung vor dem Ersetzen. `Alert.alert` ist in react-native-web ein
 * No-Op — dort fällt der Dialog auf `window.confirm` zurück, damit auf beiden
 * Plattformen dieselbe bewusste Entscheidung nötig ist.
 */
function confirmReplace(t: Translate): Promise<boolean> {
  const question = t('backup.confirmQuestion');
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(question)
        : true
    );
  }
  return new Promise((resolve) => {
    Alert.alert(t('backup.confirmTitle'), question, [
      { text: t('backup.confirmCancel'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: t('backup.confirmReplace'),
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * Persistenz-Warnung (P1 aus dem Backend-Review): läuft die App auf dem
 * Notfall-Speicher, geht der Fortschritt beim Schließen verloren. Die Warnung
 * blockiert nichts — sie sagt nur ehrlich, was los ist, und verweist auf die
 * Sicherung direkt darunter.
 */
export function PersistenceWarning() {
  const { t } = useLocale();
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // isStorageDegraded() wartet die Backend-Wahl ab — beim ersten Rendern
    // steht das Ergebnis also bereit oder kommt kurz danach.
    isStorageDegraded()
      .then((value) => {
        if (!cancelled) setDegraded(value);
      })
      .catch(() => {
        // Wer die Frage nicht beantworten kann, darf die App nicht
        // blockieren: ohne Erkenntnis keine Warnung.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!degraded) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('settings.warningTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.warningBody')}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * App-Sprache (Roadmap v2, Phase 1): Vorgabe ist die Systemsprache des
 * Geräts — sie ist zugleich die künftige Brückensprache. Wer will, schaltet
 * hier fest um; die Wahl wird wie das Lernprofil im `meta`-Speicher bewahrt.
 *
 * Native und englische Namen lassen jede Sprache unabhängig von der gerade
 * gewählten Oberfläche finden.
 */
export function AppLanguageSection() {
  const { t, setting, setSetting } = useLocale();
  const theme = useTheme();

  const options: { value: LanguageSetting; label: string }[] = [
    { value: SYSTEM_LANGUAGE_SETTING, label: t('appLanguage.system') },
    ...UI_LANGUAGES.map((language) => ({
      value: language as LanguageSetting,
      label: settingsLanguageName(language),
    })),
  ];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('appLanguage.body')}
      </ThemedText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('appLanguage.title')} style={styles.languageRow}>
        {options.map((option) => {
          const active = setting === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSetting(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={active}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={active ? 'backgroundSelected' : 'backgroundElement'}
                style={[styles.languageChip, active && { borderColor: theme.accent }]}>
                <ThemedText type="small">{option.label}</ThemedText>
                {active ? <Ionicons name="checkmark" size={20} color={theme.accent} accessible={false} /> : null}
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

/** Die drei Wahlmöglichkeiten für Tag und Nacht, mit Symbol (23.10.2026). */
export const ERSCHEINUNG_OPTIONEN: { value: Erscheinung; label: TranslationKey; icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline' }[] = [
  { value: 'system', label: 'appearance.system', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'appearance.light', icon: 'sunny-outline' },
  { value: 'dark', label: 'appearance.dark', icon: 'moon-outline' },
];

/**
 * Tag oder Nacht wählen (Nutzerwunsch 23.10.2026). „Wie das Gerät“ folgt
 * der Systemeinstellung; Tag und Nacht gelten fest, bis man sie ändert.
 * Die Wahl wirkt sofort in der ganzen App (`lib/appearance`).
 */
export function AppearanceSection() {
  const { t } = useLocale();
  const theme = useTheme();
  const wahl = useErscheinung();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('appearance.body')}
      </ThemedText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('appearance.title')} style={styles.erscheinungRow}>
        {ERSCHEINUNG_OPTIONEN.map((option) => {
          const active = wahl === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => void saveErscheinung(option.value).catch(() => {})}
              accessibilityRole="radio"
              accessibilityLabel={t(option.label)}
              aria-checked={active}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.erscheinungZelle, pressed && styles.pressed]}>
              <ThemedView
                type={active ? 'backgroundSelected' : 'backgroundElement'}
                style={[styles.erscheinungKnopf, active && { borderColor: theme.accent }]}>
                <Ionicons name={option.icon} size={24} color={active ? theme.accent : theme.textSecondary} accessible={false} />
                <ThemedText type={active ? 'smallBold' : 'small'}>{t(option.label)}</ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

/** `YYYY-MM-DD` in der Schreibweise der App-Sprache, „heute“ für heute. */
function dayLabel(day: string, t: Translate, localeTag: string): string {
  if (day === dayKey(Date.now())) return t('backup.today');
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(localeTag);
}

/**
 * Datensicherung (08.11.2026): oben die automatische Sicherung auf dem Gerät
 * (`lib/local-backup.ts`) mit „Zurückholen“ ohne Dateiauswahl, darunter der
 * Datei-Export für den Fall, dass die App gelöscht wird.
 */
export function BackupSection() {
  const { t, uiLanguage } = useLocale();
  const localeTag = localeTagFor(uiLanguage);
  const [busy, setBusy] = useState<null | 'export' | 'import' | 'save' | string>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [backups, setBackups] = useState<LocalBackup[] | null>(null);

  const refresh = useCallback(async () => {
    setBackups(await listLocalBackups().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSaveNow = useCallback(async () => {
    if (busy) return;
    setBusy('save');
    setStatus(null);
    try {
      const result = await writeLocalBackup();
      setStatus({ kind: 'success', text: t(result === 'written' ? 'backup.autoSaved' : 'backup.autoEmpty') });
      await refresh();
    } catch (error) {
      setStatus({ kind: 'error', text: messageOf(error, t) });
    } finally {
      setBusy(null);
    }
  }, [busy, refresh, t]);

  const onRestoreLocal = useCallback(async (backup: LocalBackup) => {
    if (busy) return;
    if (!(await confirmReplace(t))) return;
    setBusy(backup.name);
    setStatus(null);
    try {
      const summary = await restoreLocalBackup(backup.name);
      setStatus({
        kind: 'success',
        text: `${formatSummary(summary, t, localeTag)} ${t('backup.autoUndoHint')}`,
      });
      await refresh();
    } catch (error) {
      setStatus({ kind: 'error', text: messageOf(error, t) });
    } finally {
      setBusy(null);
    }
  }, [busy, localeTag, refresh, t]);

  const onExport = useCallback(async () => {
    if (busy) return;
    setBusy('export');
    setStatus(null);
    try {
      const fileName = await exportBackup();
      setStatus({ kind: 'success', text: t('backup.created', { fileName }) });
    } catch (error) {
      setStatus({ kind: 'error', text: messageOf(error, t) });
    } finally {
      setBusy(null);
    }
  }, [busy, t]);

  const onImport = useCallback(async () => {
    if (busy) return;
    setBusy('import');
    setStatus(null);
    try {
      const asset = await chooseBackupFile();
      // Abbrechen in der Dateiauswahl ist kein Fehler und verdient keine Meldung.
      if (!asset) return;
      if (!(await confirmReplace(t))) return;
      const summary = await restoreBackup(asset);
      setStatus({
        kind: 'success',
        text: formatSummary(summary, t, localeTag),
      });
    } catch (error) {
      setStatus({ kind: 'error', text: messageOf(error, t) });
    } finally {
      setBusy(null);
    }
  }, [busy, localeTag, t]);

  const newest = backups?.find((backup) => backup.day !== null) ?? null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('backup.autoTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('backup.autoBody')}
      </ThemedText>
      {backups !== null ? (
        <ThemedText type="small">
          {newest?.day ? t('backup.autoLast', { date: dayLabel(newest.day, t, localeTag) }) : t('backup.autoNone')}
        </ThemedText>
      ) : null}
      <ThemedButton variant="primary" disabled={busy !== null} onPress={onSaveNow}
        label={busy === 'save' ? t('backup.autoSaving') : t('backup.autoNow')} />
      {(backups ?? []).map((backup) => (
        <ThemedButton key={backup.name} disabled={busy !== null} onPress={() => void onRestoreLocal(backup)}
          label={backup.name === BEFORE_RESTORE_FILE || !backup.day
            ? t('backup.autoRestoreBefore')
            : t('backup.autoRestoreDay', { date: dayLabel(backup.day, t, localeTag) })} />
      ))}

      <View style={styles.trenner} />
      <ThemedText type="smallBold">{t('backup.fileTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('backup.body')}
      </ThemedText>
      <ThemedButton accessibilityLabel={t('backup.exportA11y')}
        disabled={busy !== null} onPress={onExport}
        label={busy === 'export' ? t('backup.exporting') : t('backup.exportButton')} />
      <ThemedButton accessibilityLabel={t('backup.importA11y')}
        disabled={busy !== null} onPress={onImport}
        label={busy === 'import' ? t('backup.importing') : t('backup.importButton')} />
      {status ? (
        status.kind === 'error' ? (
          <ThemedText type="smallBold">
            {t('backup.failed', { message: status.text })}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {status.text}
          </ThemedText>
        )
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Spacing.three,
  },
  languageRow: {
    gap: Spacing.two,
  },
  languageChip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  erscheinungRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  erscheinungZelle: {
    flex: 1,
  },
  erscheinungKnopf: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  trenner: {
    height: Spacing.two,
  },
});
