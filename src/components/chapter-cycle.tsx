import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chapterPhases, nextOpenStep, type ChapterPhase, type ChapterStep } from '@/lib/chapter-flow';
import { CHECK_SENTENCES, CHECK_WORDS, CHECK_WRITTEN } from '@/lib/chapter-check';
import { daysUntilRecheck, recheckDue, type CheckRecord } from '@/lib/chapter-recheck';
import type { Mode } from '@/lib/exercise-catalog';
import { useLocale } from '@/lib/i18n';
import { stepMinutes } from '@/lib/today-plan';

/**
 * Das Kapitel als Lernzyklus (Entwurf B, 09.11.2026, Nutzerentscheidung):
 * Ziel oben, darunter die Phasen als Stufenfolge — erledigt, jetzt, später —
 * mit ungefährer Dauer, am Ende der Kapitel-Check. Die Phase, die gerade
 * dran ist, steht offen; die anderen klappen bei Berührung auf, damit jeder
 * Schritt erreichbar bleibt. Unten steht in einem Satz, warum die aktuelle
 * Phase an dieser Stelle kommt.
 */
export function ChapterCycle({
  caption,
  title,
  setting,
  goal,
  steps,
  practised,
  finished,
  check,
  finishing,
  onOpen,
  onFinish,
}: {
  /** „Kapitel 3 von 25 · Anfänger · Teil 1“. */
  caption: string;
  title: string;
  setting?: string;
  /** Kann-Satz des Kapitels, schon übersetzt. */
  goal: string | null;
  steps: readonly ChapterStep[];
  practised: readonly string[];
  finished: boolean;
  check: CheckRecord | undefined;
  finishing: boolean;
  onOpen: (mode: Mode) => void;
  onFinish: () => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const [offen, setOffen] = useState<number | null>(null);
  const upNext = nextOpenStep(steps, practised);
  const phases = chapterPhases(steps);
  const checkPhase = phases.find((phase) => phase.steps.some(({ step }) => step[0] === 'kapitelCheck'));
  const lernPhasen = phases.filter((phase) => phase !== checkPhase);
  const aktuell = finished ? -1 : lernPhasen.findIndex((phase) => phase.steps.some(({ index }) => index === upNext));
  const sichtbar = offen ?? aktuell;
  const warum = aktuell >= 0 ? lernPhasen[aktuell] : finished ? null : checkPhase;
  const now = Date.now();
  const checkIndex = checkPhase?.steps[0]?.index ?? -1;
  const nachtestFaellig = finished && recheckDue(true, check, now);
  const checkJetzt = !finished && upNext === checkIndex;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.kopf}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>{caption}</ThemedText>
        {finished ? (
          <View style={[styles.chip, { borderColor: theme.accent }]}>
            <Ionicons name="checkmark" size={12} color={theme.accent} />
            <ThemedText type="small" themeColor="accent">{t('chapter.completed')}</ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="subtitle">{title}</ThemedText>
      {setting ? <ThemedText type="small" themeColor="textSecondary">{setting}</ThemedText> : null}
      {goal ? (
        <View style={[styles.ziel, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="flag-outline" size={16} color={theme.link} />
          <ThemedText type="small" style={[styles.flex, { color: theme.link }]}>{goal}</ThemedText>
        </View>
      ) : null}

      {lernPhasen.map((phase, position) => (
        <PhaseRow
          key={phase.title}
          number={position + 1}
          phase={phase}
          practised={practised}
          upNext={upNext}
          current={position === aktuell}
          expanded={position === sichtbar}
          onToggle={() => setOffen(position === sichtbar ? -1 : position)}
          onOpen={onOpen}
        />
      ))}

      {checkPhase ? (
        <Pressable
          onPress={() => onOpen('kapitelCheck')}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}>
          <View
            style={[
              styles.check,
              { borderColor: checkJetzt || nachtestFaellig ? theme.accent : theme.borderSubtle },
              (checkJetzt || nachtestFaellig) && { backgroundColor: theme.backgroundSelected },
            ]}>
            <Ionicons
              name={finished ? 'ribbon' : 'flag'}
              size={18}
              color={checkJetzt || nachtestFaellig || finished ? theme.accent : theme.textSecondary}
            />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{t('chapterCheck.title')}</ThemedText>
              <ThemedText type="small" themeColor={nachtestFaellig ? 'accent' : 'textSecondary'}>
                {finished
                  ? nachtestFaellig
                    ? t('chapter.recheckDue')
                    : check ? t('chapter.recheckIn', { days: daysUntilRecheck(check, now) }) : t('chapter.completed')
                  : t('chapter.checkCaption', { count: CHECK_WORDS + CHECK_WRITTEN + CHECK_SENTENCES })}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </View>
        </Pressable>
      ) : null}

      {warum ? (
        <View style={styles.warum}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>{t(warum.why)}</ThemedText>
        </View>
      ) : null}

      {finished ? null : (
        <Pressable
          onPress={onFinish}
          disabled={finishing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">{t('chapter.finishWithoutCheck')}</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

/** Eine Phase: Kreis mit Nummer oder Haken, Name, enthaltene Schritte und Dauer. */
function PhaseRow({
  number,
  phase,
  practised,
  upNext,
  current,
  expanded,
  onToggle,
  onOpen,
}: {
  number: number;
  phase: ChapterPhase;
  practised: readonly string[];
  upNext: number;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (mode: Mode) => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const erledigt = phase.steps.every(({ step }) => practised.includes(step[0]));
  const minuten = phase.steps.reduce((summe, { step }) => summe + stepMinutes(step[0]), 0);
  const namen = phase.steps.map(({ step }) => t(step[1])).join(', ');
  const titel = current ? `${t(phase.title)} · ${t('chapter.phaseNow')}` : t(phase.title);
  return (
    <View style={[styles.phase, current && { backgroundColor: theme.backgroundSelected }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${titel}: ${namen}`}
        style={({ pressed }) => [styles.phaseKopf, pressed && styles.pressed]}>
        <View
          style={[
            styles.kreis,
            erledigt
              ? { backgroundColor: theme.accent, borderColor: theme.accent }
              : { borderColor: current ? theme.accent : theme.borderSubtle, borderWidth: current ? 2 : 1 },
          ]}>
          {erledigt
            ? <Ionicons name="checkmark" size={15} color={theme.accentText} />
            : <ThemedText type="smallBold" themeColor={current ? 'accent' : 'textSecondary'}>{number}</ThemedText>}
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" themeColor={current || erledigt ? 'text' : 'textSecondary'}>{titel}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {namen} · {t('common.aboutMinutes', { minutes: minuten })}
          </ThemedText>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
      </Pressable>
      {expanded ? (
        <View style={styles.schritte}>
          {phase.steps.map(({ step, index }) => (
            <StepButton
              key={`${step[0]}:${index}`}
              step={step}
              index={index}
              practised={practised.includes(step[0])}
              next={index === upNext}
              onPress={() => onOpen(step[0])}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Ein Schritt zum Antippen: „3. Karteikarten“, „Als Nächstes“ oder ein Haken. */
function StepButton({
  step,
  index,
  practised,
  next,
  onPress,
}: {
  step: ChapterStep;
  index: number;
  practised: boolean;
  next: boolean;
  onPress: () => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const label = `${index + 1}. ${t(step[1])}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={practised ? t('path.stepPractisedA11y', { step: label }) : next ? `${label}, ${t('chapter.upNext')}` : label}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={next ? 'backgroundElement' : 'background'} style={[styles.schritt, next && { borderColor: theme.accent, borderWidth: 1 }]}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{label}</ThemedText>
          {next ? <ThemedText type="small" themeColor="accent">{t('chapter.upNext')}</ThemedText> : null}
        </View>
        {practised
          ? <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
          : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
      </ThemedView>
    </Pressable>
  );
}

/**
 * Kapitel 0 „Grundlagen“ im selben Aussehen: Es hat keine Phasen und keinen
 * Check, nur Schritte und den Knopf zum Abschließen.
 */
export function FoundationsCycle({
  intro,
  steps,
  practised,
  done,
  finishing,
  onOpen,
  onFinish,
}: {
  intro: string;
  steps: readonly ChapterStep[];
  practised: readonly string[];
  done: boolean;
  finishing: boolean;
  onOpen: (mode: Mode) => void;
  onFinish: () => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const upNext = done ? -1 : nextOpenStep(steps, practised);
  const minuten = steps.reduce((summe, step) => summe + stepMinutes(step[0]), 0);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.kopf}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>{t('foundations.chapter')}</ThemedText>
        {done ? (
          <View style={[styles.chip, { borderColor: theme.accent }]}>
            <Ionicons name="checkmark" size={12} color={theme.accent} />
            <ThemedText type="small" themeColor="accent">{t('chapter.completed')}</ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="subtitle">{t('foundations.title')}</ThemedText>
      <View style={[styles.ziel, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="flag-outline" size={16} color={theme.link} />
        <ThemedText type="small" style={[styles.flex, { color: theme.link }]}>{intro}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">{t('common.aboutMinutes', { minutes: minuten })}</ThemedText>
      <View style={styles.schritte}>
        {steps.map((step, index) => (
          <StepButton
            key={`${step[0]}:${index}`}
            step={step}
            index={index}
            practised={practised.includes(step[0])}
            next={index === upNext}
            onPress={() => onOpen(step[0])}
          />
        ))}
      </View>
      <ThemedButton
        label={done ? t('chapter.completed') : t('chapter.finish')}
        disabled={finishing || done}
        onPress={onFinish}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  kopf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  ziel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  phase: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  phaseKopf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  kreis: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schritte: {
    gap: Spacing.one,
  },
  schritt: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 52,
  },
  warum: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  tapTarget: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
