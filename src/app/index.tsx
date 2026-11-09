import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useRouter, type Href } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDirectionSummariesFor } from '@/components/direction-dashboard';
import { FeatureLegend } from '@/components/feature-legend';
import { GradientFill, Shine, usePressScale } from '@/components/fx';
import { LanguageHero } from '@/components/language-hero';
import { LanguagePicker } from '@/components/language-picker';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { Spacing, type ThemeColor } from '@/constants/theme';
import { useCatalogLanguages } from '@/hooks/use-catalog-languages';
import { useLearnerLanguage } from '@/hooks/use-learner-language';
import { useNextStep } from '@/hooks/use-next-step';
import { useTheme } from '@/hooks/use-theme';
import { ensureLanguages } from '@/lib/content/catalog-languages';
import { isLanguageLoaded } from '@/lib/content/catalog-state';
import type { NextStep } from '@/lib/chapter-flow';
import { groupsForDirection } from '@/lib/exercise-catalog';
import type { LearningChapter } from '@/lib/learning-path';
import { situationTranslation } from '@/lib/conversation/types';
import { useLocale } from '@/lib/i18n';
import { featureIsImplemented } from '@/lib/languages/feature';
import { defaultGoalDirection, zieleFuerBruecke, goalLanguage } from '@/lib/languages/goals';
import { learningLanguage } from '@/lib/languages/definitions';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { setReviewSpot } from '@/lib/profile';
import { loadStreak } from '@/lib/stats';
import { migrateStore } from '@/lib/storage/migration';
import { todayMinutes } from '@/lib/today-plan';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Ein Symbol je Lernbereich, in der Reihenfolge von `groupsForDirection` (wie im Lern-Reiter). */
const BEREICH_ICONS: IoniconName[] = ['layers', 'headset', 'book', 'mic', 'extension-puzzle'];

/**
 * „Heute“ statt Sprachliste (Entwurf A, 09.11.2026, Nutzerentscheidung):
 * Die Startseite sagt, was heute dran ist — erst die fälligen Wiederholungen,
 * dann ein fälliger Nachtest, dann der nächste Kapitelschritt — und startet
 * das mit einem Knopf. Darunter zwei Zahlen (Tage in Folge, sichere Wörter)
 * und „Frei üben“ für die fünf Lernbereiche. Die Sprachliste steht unten
 * zum Aufklappen; bei einem neuen Nutzer ist sie offen.
 *
 * Der Migrationslauf (AE-43) wird hier einmal angestoßen: Er ist idempotent,
 * lässt Kartenzustände unangetastet und tut auf einem aktuellen Speicher
 * nichts.
 */
export default function DashboardScreen() {
  const { language, profile, chooseLanguage } = useLearnerLanguage();
  const { t, systemLanguage, languageName, uiLanguage } = useLocale();
  const router = useRouter();
  const theme = useTheme();
  // SEIT STUFE 1 FOLGT DIE ZIELLISTE DER BRÜCKE (App-/Oberflächensprache):
  // Brücke Deutsch sieht die vier Bestandsziele, Brücken th/en/es ihre
  // jeweiligen Paare — inklusive Kreuzzielen mit concept-gekoppeltem Stoff.
  const ziele = zieleFuerBruecke(uiLanguage);
  // Jedes Mal neu zählen, wenn die Seite wieder sichtbar wird: Nach einer
  // Übung stand sonst die alte Fällig-Zahl da.
  const [fokus, setFokus] = useState(0);
  const [serie, setSerie] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    setFokus((wert) => wert + 1);
    let cancelled = false;
    loadStreak().then((tage) => { if (!cancelled) setSerie(tage); }).catch(() => {});
    return () => { cancelled = true; };
  }, []));
  // Fällig-Zahlen genau für die Ziele dieser Oberfläche.
  const due = useDirectionSummariesFor(ziele.map((ziel) => ziel.direction), fokus > 0, fokus);
  // Lokale Wahl schlägt das Profil: Sie steht sofort fest, während das
  // Lesezeichen noch geschrieben wird — sonst spränge die Markierung des
  // Deutsch-Ziels (gleiche Profil-Sprache wie Thai) kurz zurück.
  const [wahlRichtung, setWahlRichtung] = useState<PairDirection | null>(null);
  // Dieselbe Regel wie im Ladetor beim Start (`defaultGoalDirection`): So ist
  // die Sprache des vorgewählten Ziels immer schon geladen.
  const selectedDirection = defaultGoalDirection(uiLanguage, profile ?? { language, review: null }, wahlRichtung);

  // Die Beschreibung unter dem Picker hängt am GEWÄHLTEN Ziel: Beim Deutsch-
  // Ziel war sonst der Thai-Tontext zu lesen (gleiche Paarsprache, anderes
  // Ziel — Nutzerhinweis 10.09.). Ohne Wahl gilt das erste Ziel der Brücke.
  const aktivesZiel =
    ziele.find(ziel => ziel.direction === selectedDirection) || ziele[0];
  const zielBeschreibung = t(learningLanguage(aktivesZiel.language).feature.description);
  const summary = due.summaries?.find((item) => item.direction === aktivesZiel.direction);
  // Seit 08.11.2026 nur echte Wiederholungen, ohne neue Karten.
  const totalDue = summary?.reviewDue ?? null;
  const heute = useNextStep(profile ? aktivesZiel.direction : null);
  const naechster = heute?.next ?? null;
  const nachtest = heute?.recheck ?? null;
  // Reihenfolge: Wiederholungen, dann ein fälliger Nachtest, dann Neues.
  const zielAdresse: string = (totalDue ?? 0) > 0
    ? `/review?direction=${aktivesZiel.direction}&mode=heute`
    : nachtest
      ? `/review?direction=${aktivesZiel.direction}&mode=kapitelCheck&kapitel=${encodeURIComponent(nachtest.id)}`
      : naechster
      ? `/review?direction=${aktivesZiel.direction}&mode=${naechster.step?.[0] ?? 'path'}&kapitel=${encodeURIComponent(naechster.chapterId)}`
      : `/review?direction=${aktivesZiel.direction}`;
  // Katalog je Lernsprache: Die Sprache des aktiven Ziels bleibt geladen
  // (Merkhilfe, Lern-Reiter). Das Ladetor hat sie beim Start schon geholt.
  // Erst mit gelesenem Profil: Vorher steht hier die Vorgabe Thai, und eine
  // Spanisch-Lernerin lud beim Start sonst Thai gleich mit (Messung 18.10.).
  useCatalogLanguages(profile ? [aktivesZiel.language] : []);
  const [ladeRichtung, setLadeRichtung] = useState<PairDirection | null>(null);
  const [ladeFehler, setLadeFehler] = useState(false);
  // Sprachliste: offen, solange noch kein Lernziel gemerkt ist (erster Start).
  const [sprachenOffen, setSprachenOffen] = useState<boolean | null>(null);
  const listeOffen = sprachenOffen ?? (profile !== null && profile.review === null);
  const letzteWahl = useRef(0);

  /**
   * Lernziel gewählt: Paarsprache UND Richtung in einem. Reihenfolge ist
   * Bedeutung — `setLanguage` wirft den gemerkten Stand bewusst weg (Geste
   * „von vorn”), erst danach darf die neue Richtung als Lesezeichen
   * (`review` spot) geschrieben werden.
   *
   * Katalog je Lernsprache: Erst wird die Sprachdatei geladen (die Zeile sagt
   * „lädt …“), dann gewählt — so sehen Merkhilfe und Lern-Reiter nie eine
   * leere Sprache. Gilt nur die jeweils letzte Wahl; meldet, ob gewählt wurde.
   */
  const chooseGoal = useCallback(
    async (direction: PairDirection): Promise<boolean> => {
      const sprache = targetLanguageOf(direction);
      const nummer = ++letzteWahl.current;
      setLadeFehler(false);
      if (!isLanguageLoaded(sprache)) setLadeRichtung(direction);
      try {
        await ensureLanguages([sprache]);
      } catch (error) {
        console.warn('[catalog] Sprachwechsel:', error);
        if (nummer === letzteWahl.current) {
          setLadeRichtung(null);
          setLadeFehler(true);
        }
        return false;
      }
      if (nummer !== letzteWahl.current) return false;
      setLadeRichtung(null);
      setWahlRichtung(direction);
      void chooseLanguage(sprache)
        .then(() => setReviewSpot({ direction, mode: 'cards' }))
        .catch(() => {});
      return true;
    },
    [chooseLanguage]
  );

  /**
   * Direkter Einstieg aus einer Ziel-Zeile (Nutzerwunsch 13.09.): wählt wie
   * die Zeile selbst und öffnet den Lern-Reiter SOFORT mit der Richtung als
   * Adresse.
   */
  const startGoal = useCallback(
    (direction: PairDirection) => {
      void chooseGoal(direction).then((gewaehlt) => {
        if (gewaehlt) router.push(`/review?direction=${direction}`);
      });
    },
    [chooseGoal, router]
  );

  useEffect(() => {
    migrateStore().catch((error) => {
      console.warn('[storage] Migration fehlgeschlagen, weiter mit dem vorhandenen Stand.', error);
    });
  }, []);

  // Kopfzeile wie im Entwurf: „Spanisch · Kapitel 3 von 25“.
  const sprachName = languageName(goalLanguage(aktivesZiel));
  const kopfzeile = naechster?.chapter
    ? `${sprachName} · ${t('home.chapterOf', { index: naechster.position, total: naechster.stageCount })}`
    : naechster?.foundations
      ? `${sprachName} · ${t('foundations.title')}`
      : sprachName;

  return (
    <ScreenScaffold title={t('home.todayTitle')} subtitle={kopfzeile}>
      {/* Der Gruß folgt dem GEWÄHLTEN Ziel (Nutzerwunsch 13.09.): Thai zeigt
          die Töne, Deutsch den deutschen Gruß. */}
      <LanguageHero language={goalLanguage(aktivesZiel)} />

      <DeineRunde
        reviews={totalDue}
        next={heute === undefined ? undefined : naechster}
        recheck={nachtest}
        href={zielAdresse as Href}
      />

      <View style={styles.kacheln}>
        <Kachel label={t('home.streak')} value={serie === null ? '–' : t('home.streakValue', { count: serie })} />
        <Kachel label={t('home.secure')} value={summary ? t('home.vocabCount', { count: summary.mastered }) : '–'} />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">{t('home.freePractice')}</ThemedText>
        <View style={styles.chips}>
          {groupsForDirection(aktivesZiel.direction).map((group, index) => (
            <Link key={group.label} href={`/review?direction=${aktivesZiel.direction}&bereich=${index}` as Href} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.chip}>
                  <Ionicons name={BEREICH_ICONS[index] ?? 'sparkles'} size={14} color={theme.accent} />
                  <ThemedText type="small">{t(group.label)}</ThemedText>
                </ThemedView>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={() => setSprachenOffen(!listeOffen)}
          accessibilityRole="button"
          accessibilityState={{ expanded: listeOffen }}
          style={({ pressed }) => [styles.sprachKopf, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">{t('home.languageNow')}</ThemedText>
            <ThemedText type="smallBold">{sprachName}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="accent">{t('home.switchLanguage')}</ThemedText>
          <Ionicons name={listeOffen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.accent} />
        </Pressable>
        {listeOffen ? (
          <>
            <LanguagePicker
              // Die Markierung folgt dem AKTIVEN Ziel, nicht der gemerkten Profil-
              // Sprache (Nutzerbefund 21.09., Fund 2). `ziel.language` ist genau
              // der Zeilenschlüssel des Pickers (beim Deutsch-Ziel 'th').
              selected={aktivesZiel.language}
              selectedDirection={selectedDirection}
              onSelect={(direction) => void chooseGoal(direction)}
              onStart={startGoal}
              due={due.summaries}
              loadingDirection={ladeRichtung}
            />
            {ladeFehler ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('catalog.loadFailed')}
              </ThemedText>
            ) : null}
            {/* Jede Sprache hat ihre eigene Merkhilfe: Tonfarben bei Thai, die
                Betonungsregel bei Spanisch, die Schriftstück-Gruppen bei Englisch. */}
            {featureIsImplemented(aktivesZiel.language) ? <FeatureLegend language={aktivesZiel.language} /> : null}
            <ThemedText type="small" themeColor="textSecondary">
              {zielBeschreibung}
            </ThemedText>
            {/* Nur solange die App-Sprache der Gerätesprache folgt (Testlauf 04.10.2026). */}
            {uiLanguage === systemLanguage ? <ThemedText type="small" themeColor="textSecondary">
              {t('home.systemLanguage', { language: languageName(systemLanguage) })}
            </ThemedText> : null}
          </>
        ) : null}
      </View>
    </ScreenScaffold>
  );
}

function Kachel({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.kachel} accessible accessibilityLabel={`${label}: ${value}`}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="subtitle" style={styles.kachelWert}>{value}</ThemedText>
    </ThemedView>
  );
}

/** Eine Zeile der Runde: Symbol im farbigen Kreis, Titel, eine Zeile Erklärung. */
function RundenZeile({
  icon,
  bg,
  fg,
  title,
  body,
  done = false,
}: {
  icon: IoniconName;
  bg: ThemeColor;
  fg: ThemeColor;
  title: string;
  body?: string;
  done?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.zeile} accessible accessibilityLabel={body ? `${title}: ${body}` : title}>
      <View style={[styles.kreis, { backgroundColor: done ? 'transparent' : theme[bg] }]}>
        <Ionicons name={done ? 'checkmark-circle' : icon} size={done ? 26 : 16} color={done ? theme.accent : theme[fg]} />
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold" themeColor={done ? 'textSecondary' : 'text'}>{title}</ThemedText>
        {body ? <ThemedText type="small" themeColor="textSecondary">{body}</ThemedText> : null}
      </View>
    </View>
  );
}

/**
 * „Deine Runde“: was der Knopf darunter nacheinander öffnet. Zahlen
 * erscheinen erst geladen, nie geraten; die Dauer ist eine Schätzung
 * (`lib/today-plan.ts`) und steht deshalb mit „ca.“ da.
 */
function DeineRunde({
  reviews,
  next,
  recheck,
  href,
}: {
  reviews: number | null;
  next: NextStep | null | undefined;
  recheck: LearningChapter | null;
  href: Href;
}) {
  const { t, uiLanguage } = useLocale();
  const theme = useTheme();
  const ctaPress = usePressScale();
  const minuten = reviews === null || next === undefined
    ? 0
    : todayMinutes({ reviews, recheck: recheck !== null, step: next?.step?.[0] ?? null });
  const kapitel = next
    ? next.chapter
      ? situationTranslation(next.chapter.situation, uiLanguage).title
      : t('foundations.title')
    : '';
  const offen = (reviews ?? 0) > 0 || recheck !== null || Boolean(next);
  return (
    <ThemedView type="backgroundElement" style={styles.runde}>
      <ThemedText type="smallBold">
        {minuten > 0 ? `${t('home.roundTitle')} · ${t('common.aboutMinutes', { minutes: minuten })}` : t('home.roundTitle')}
      </ThemedText>
      {reviews !== null ? (
        <RundenZeile
          icon="refresh"
          bg="gradientStart"
          fg="gradientText"
          title={t('home.roundReview')}
          body={reviews > 0 ? t('home.roundReviewBody', { count: reviews }) : t('home.todayNoReviews')}
          done={reviews === 0}
        />
      ) : null}
      {recheck ? (
        <RundenZeile
          icon="ribbon-outline"
          bg="rateHardBg"
          fg="rateHardText"
          title={t('home.roundRecheck')}
          body={t('home.roundRecheckBody', { chapter: situationTranslation(recheck.situation, uiLanguage).title })}
        />
      ) : null}
      {next !== undefined ? (
        next ? (
          <RundenZeile
            icon="book-outline"
            bg="backgroundSelected"
            fg="link"
            title={t('home.roundChapter', { index: next.position, chapter: kapitel })}
            body={next.step
              ? t('home.roundStep', { step: next.stepIndex + 1, total: next.stepCount, name: t(next.step[1]) })
              : t('home.todayFinish', { chapter: kapitel })}
          />
        ) : (
          <RundenZeile icon="checkmark-circle" bg="backgroundSelected" fg="link" title={t('home.todayAllDone')} done />
        )
      ) : null}
      <Link href={href} asChild>
        {/* Die Fläche steht bewusst auf dem inneren View, NICHT auf dem
            Pressable: expo-routers asChild-Klon ersetzt den Style des Kindes
            (UI-Review 2026-09-09, im Web-Build gemessen). */}
        <Pressable
          accessible
          accessibilityRole="button"
          onPressIn={ctaPress.onPressIn}
          onPressOut={ctaPress.onPressOut}>
          {/* Der Glanzpunkt der Startseite (seit 22.10.2026): Verlauf, Leuchten
              und ein wanderndes Glanzlicht; beim Druck federt die Fläche. */}
          <Animated.View
            style={[styles.cta, { boxShadow: `0 12px 34px ${theme.gradientStart}59` }, ctaPress.style]}>
            <GradientFill radius={16} />
            <Shine />
            <Ionicons name="play" size={18} color={theme.gradientText} />
            <ThemedText type="default" style={[styles.ctaLabel, { color: theme.gradientText }]}>
              {offen ? t('home.roundStart') : t('home.heroCta')}
            </ThemedText>
          </Animated.View>
        </Pressable>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  runde: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  kreis: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  kacheln: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kachel: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  kachelWert: {
    fontSize: 22,
    lineHeight: 28,
  },
  section: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    minHeight: 40,
  },
  sprachKopf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 54,
    marginTop: Spacing.one,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  ctaLabel: {
    fontWeight: '800',
    fontSize: 18,
  },
});
