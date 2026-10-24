import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import type { VocabEntry } from '@/data/vocab-types';
import { useTheme } from '@/hooks/use-theme';
import {
  DIALOGE_VORSCHLAG, MAX_DIALOGE_JE_STUFE, stufenAbdeckung, ZIELWOERTER_JE_DIALOG, type StufenAbdeckung,
} from '@/lib/conversation/dialog-words';
import type { ConversationSituation } from '@/lib/conversation/types';
import { useLocale } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/keys';
import type { LanguageCode } from '@/lib/languages/types';
import { LEARNING_STAGES, STAGE_KEYS, type LearningStage } from '@/lib/learning-stages';
import { readMeta, writeMeta } from '@/lib/repository';

/**
 * Anzahl der Dialoge je Lernsprache und Stufe (24.10.2026). Der Studio-Lauf
 * erzeugt je Stufe die fehlenden Dialoge bis zu dieser Zahl; darunter steht,
 * welche Wörter sie abdecken. GER-Kürzel bleiben unsichtbar.
 */

export type DialogAnzahl = Record<LearningStage, number>;

export const dialogAnzahlSchluessel = (language: LanguageCode, stage: LearningStage) =>
  `dialog-anzahl:${language}:${stage}`;

export async function ladeDialogAnzahl(language: LanguageCode): Promise<DialogAnzahl> {
  const werte = await Promise.all(LEARNING_STAGES.map((stage) =>
    readMeta<number>(dialogAnzahlSchluessel(language, stage), DIALOGE_VORSCHLAG[stage])));
  return Object.fromEntries(LEARNING_STAGES.map((stage, index) => [stage, werte[index]])) as DialogAnzahl;
}

/** Die Zeilen unter der Zahl — rein, damit sie testbar sind. */
export function abdeckungsText(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  abdeckung: StufenAbdeckung
): string[] {
  return [
    t('studio.dialogCoverage', {
      count: abdeckung.dialogeNachLauf, covered: abdeckung.abgedecktNachLauf,
      total: abdeckung.gesamt, rest: abdeckung.uebrig,
    }),
    t('studio.dialogStock', { dialogs: abdeckung.dialoge, older: abdeckung.aeltere, next: abdeckung.neueDialoge }),
  ];
}

type Props = {
  language: LanguageCode;
  vocabulary: readonly VocabEntry[];
  situations: readonly ConversationSituation[];
  blocked?: boolean;
};

export function DialogAnzahlCard({ language, vocabulary, situations, blocked = false }: Props) {
  const { t } = useLocale();
  const theme = useTheme();
  const [anzahl, setAnzahl] = useState<DialogAnzahl>(DIALOGE_VORSCHLAG);

  useEffect(() => {
    let cancelled = false;
    void ladeDialogAnzahl(language).then((werte) => { if (!cancelled) setAnzahl(werte); }).catch(() => {});
    return () => { cancelled = true; };
  }, [language]);

  const abdeckung = useMemo(() => LEARNING_STAGES.map((stage) =>
    stufenAbdeckung({ language, stage, anzahl: anzahl[stage], vocabulary, situations })),
  [language, anzahl, vocabulary, situations]);

  const setze = (stage: LearningStage, text: string) => {
    const zahl = Math.min(MAX_DIALOGE_JE_STUFE, Number.parseInt(text.replace(/[^0-9]/g, ''), 10) || 0);
    setAnzahl((vorher) => ({ ...vorher, [stage]: zahl }));
    void writeMeta(dialogAnzahlSchluessel(language, stage), zahl).catch(() => {});
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('studio.dialogCountTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('studio.dialogCountHint', { words: ZIELWOERTER_JE_DIALOG })}
      </ThemedText>
      {abdeckung.map((stufe) => (
        <View key={stufe.stage} style={styles.stufe}>
          <View style={styles.zeile}>
            <ThemedText type="small">{t(STAGE_KEYS[stufe.stage])}</ThemedText>
            <TextInput
              value={String(anzahl[stufe.stage])}
              onChangeText={(text) => setze(stufe.stage, text)}
              keyboardType="number-pad"
              editable={!blocked}
              accessibilityLabel={`${t('studio.dialogCountTitle')}: ${t(STAGE_KEYS[stufe.stage])}`}
              style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
            />
          </View>
          {abdeckungsText(t, stufe).map((zeile) => (
            <ThemedText key={zeile} type="small" themeColor="textSecondary">{zeile}</ThemedText>
          ))}
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  stufe: { gap: Spacing.one },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, fontSize: 13, width: 90 },
});
