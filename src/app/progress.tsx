import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { LanguageSwitch } from '@/components/language-switch';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { useCountUp } from '@/components/fx';
import { ThemedText, displayLineHeight } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Tone } from '@/constants/tones';
import { useToneColor } from '@/hooks/use-theme';
import { drillCount } from '@/lib/review-log';
import { directionForBridge, goalLanguage, zielFuerDirection } from '@/lib/languages/goals';
import { contentDirectionOf, PairDirection, targetLanguageOf } from '@/lib/languages/types';
import { DRILLS } from '@/lib/drills/types';
import { modeLabel, modesForDirection, type Mode } from '@/lib/exercise-catalog';
import { loadProfile } from '@/lib/profile';
import { TranslationKey, localeTagFor, useLocale, type UiLanguage } from '@/lib/i18n';
import { CARD_STATE_ORDER, LearningStats, loadLearningStats, type Treffer } from '@/lib/stats';

/**
 * Kartenzustaende auf Toene abgebildet - die Farbe selbst kommt zur Laufzeit
 * aus dem Anzeigemodus (AE-24).
 */
const STATE_TONES: Record<string, Tone> = {
  new: 'low',
  learning: 'falling',
  review: 'high',
  mastered: 'mid',
};

/** Kartenzustände als Übersetzungsschlüssel statt als deutsche Konstante. */
const STATE_KEYS: Record<string, TranslationKey> = {
  new: 'state.new',
  learning: 'state.learning',
  review: 'state.review',
  mastered: 'state.mastered',
};

/**
 * „2026-05-12" → „12. Mai" — dieselbe Information wie die Spaltenbeschriftung,
 * nur als ganze Ansage. Die Monatsnamen kommen aus der UI-Sprache.
 */
export function tagLabel(date: string, language: UiLanguage): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTagFor(language), { day: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, day, 12));
}

/** ISO-Datum als volles Datum je UI-Sprache („2026-09-21" → „21. September 2026"). */
function langesDatum(iso: string, language: UiLanguage): string {
  return new Intl.DateTimeFormat(localeTagFor(language), { dateStyle: 'long' }).format(new Date(iso));
}

export default function ProgressScreen() {
  const { t, languageName, uiLanguage } = useLocale();
  // Erst das Profil, dann die Zahlen: Ein fester Vorgabewert lud im App-Build
  // sonst kurz eine fremde Sprachdatei (Katalog je Lernsprache).
  const [selected, setSelected] = useState<PairDirection | null>(null);
  const direction = selected ? directionForBridge(uiLanguage, selected) : null;
  const [loaded, setLoaded] = useState<{
    direction: PairDirection; stats?: LearningStats; error?: string;
  } | null>(null);
  const stats = loaded?.direction === direction ? loaded.stats : undefined;
  const error = loaded?.direction === direction ? loaded.error : undefined;

  // Die Statistik-Auswahl verändert weder Profil noch Lern-Lesezeichen.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadProfile().then((profile) => {
      if (!cancelled) setSelected(directionForBridge(
        uiLanguage, profile.review?.direction ?? contentDirectionOf(profile.language)
      ));
    }).catch((e) => {
      if (!cancelled) {
        setSelected('de_to_th');
        setLoaded({ direction: directionForBridge(uiLanguage, 'de_to_th'), error: String(e) });
      }
    });
    return () => { cancelled = true; };
  }, [uiLanguage]));

  useFocusEffect(useCallback(() => {
    if (!direction) return;
    let cancelled = false;
    loadLearningStats(undefined, Date.now(), 14, direction)
      .then((result) => {
        if (!cancelled) setLoaded({ direction, stats: result });
      })
      .catch((e) => {
        if (!cancelled) setLoaded({ direction, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [direction]));

  if (error) {
    return (
      <ScreenScaffold title={t('tabs.progress')} subtitle={t('progress.subtitle')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.loadFailed', { message: error })}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  if (!stats || !direction) {
    return (
      <ScreenScaffold title={t('tabs.progress')} subtitle={t('progress.subtitle')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('progress.loading')}
        </ThemedText>
      </ScreenScaffold>
    );
  }

  const ziel = zielFuerDirection(direction);
  // Dieselbe Zahl wie „fällig“ auf der Übersicht: Wiederholungen plus die
  // neuen Karten, die eine Sitzung heute aufnimmt.
  const heuteFaellig = stats.totalDue;

  return (
    <ScreenScaffold
      title={t('tabs.progress')}
      subtitle={t('progress.subtitle')}>

      {/* Sprachübergreifend: was heute passiert ist. */}
      <View style={styles.grid}>
        <Tile label={t('tile.reviewsToday')} value={String(stats.reviewsToday)} />
        <Tile label={t('tile.drillsToday')} value={String(stats.drillsToday)} hint={t('tile.drillsHint')} />
        <Tile
          label={t('tile.accuracyToday')}
          value={prozentText(stats.accuracyToday)}
          hint={stats.accuracyToday.total > 0
            ? t('progress.correctOf', { correct: stats.accuracyToday.correct, total: stats.accuracyToday.total })
            : undefined}
        />
        <Tile
          label={t('tile.streak')}
          value={String(stats.streak)}
          hint={stats.streak === 1 ? t('tile.dayOne') : t('tile.dayMany')}
        />
      </View>

      <ReviewChart stats={stats} />

      {/* Ab hier: das gewählte Lernziel. */}
      <ThemedText type="smallBold">
        {t('progress.subtitleLanguage', {
          language: languageName(ziel ? goalLanguage(ziel) : targetLanguageOf(direction)),
        })}
      </ThemedText>
      <LanguageSwitch selected={direction} onSelect={setSelected} />
      <View style={styles.grid}>
        {/* Erarbeitetes statt Stapelgröße: „begonnen“ heißt mindestens einmal
            bewertet; die Gesamtzahl steht klein daneben. */}
        <Tile label={t('tile.dueToday')} value={String(heuteFaellig)} />
        <Tile
          label={t('tile.started')}
          value={String(stats.totalCards - stats.cardStates.new)}
          hint={t('tile.ofTotal', { total: stats.totalCards })}
        />
        <Tile label={t('tile.mastered')} value={String(stats.cardStates.mastered)} />
      </View>

      <Forecast stats={stats} />
      <WeakAreas stats={stats} direction={direction} />
      <Milestones stats={stats} />
      <CardStates stats={stats} />

    </ScreenScaffold>
  );
}

/** „75 %“ oder „–“, wenn es noch nichts zu zählen gibt. */
function prozentText(treffer: Treffer): string {
  // Geschütztes Leerzeichen: „100 %“ brach in der schmalen Kachel um.
  return treffer.total > 0 ? `${Math.round((treffer.correct / treffer.total) * 100)}\u00A0%` : '–';
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  // Seit 22.10.2026 zählt die Kennzahl beim Öffnen hoch.
  const angezeigt = useCountUp(value);
  return (
    <ThemedView type="backgroundElement" style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.tileValue}>
        {/* `stat` ist die gemeinsame Stufe für Kennzahlen (UI-Review
            2026-09-07); die Zeilenhöhe wächst mit der Systemschrift mit. */}
        <ThemedText
          type="stat"
          numberOfLines={1}
          maxFontSizeMultiplier={2}
          style={{ lineHeight: displayLineHeight(34, 2, 1.17) }}>
          {angezeigt}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

function ReviewChart({ stats }: { stats: LearningStats }) {
  // Wiederholungen und Uebungen werden gestapelt, nicht summiert dargestellt:
  // beides ist Lernzeit, aber nur die Wiederholungen laufen durch FSRS
  // (AE-16). Eine gemeinsame Saeule ohne Trennung wuerde die Beschriftung
  // "Wiederholungen" zur Unwahrheit machen.
  const toneColor = useToneColor();
  const { t, uiLanguage } = useLocale();
  const max = Math.max(1, ...stats.days.map((day) => day.total + drillCount(day)));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('chart.perDay')}</ThemedText>
      <View style={styles.legend}>
        <LegendDot color={toneColor('mid')} label={t('chart.legendReviews')} />
        <LegendDot color={toneColor('high')} label={t('chart.legendDrills')} />
      </View>

      <View style={styles.chart}>
        {stats.days.map((day) => (
          // Screenreader: Eine Spalte = EINE Ansage mit Datum und beiden Werten
          // (UI-Review 2026-09-07). Balken, Ziffer und Tageszahl sind
          // Verzierungen derselben Information und werden versteckt — sonst
          // liest der Reader „12, 12, 8, 3, 12“ statt einem Satz.
          <View
            key={day.date}
            style={styles.barColumn}
            accessible
            accessibilityLabel={t('chart.columnA11y', {
              date: tagLabel(day.date, uiLanguage),
              reviews: day.total,
              drills: drillCount(day),
            })}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.barValue}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {day.total + drillCount(day) > 0 ? day.total + drillCount(day) : ''}
            </ThemedText>
            <View
              style={styles.barTrack}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {drillCount(day) > 0 ? (
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${(drillCount(day) / max) * 100}%`,
                      backgroundColor: toneColor('high'),
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.barFill,
                  {
                    height: `${(day.total / max) * 100}%`,
                    backgroundColor: day.total > 0 ? toneColor('mid') : 'transparent',
                  },
                ]}
              />
            </View>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.barLabel}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {day.date.slice(8)}
            </ThemedText>
          </View>
        ))}
      </View>

      {/*
        Diese Einschränkung gehört sichtbar in die App, nicht nur ins
        Protokoll: die Zahlen sind sonst leicht als vollständige Lernhistorie
        misszuverstehen.
      */}
      <ThemedText type="small" themeColor="textSecondary">
        {stats.loggedSince
          ? stats.totalDrills > 0
            ? t('chart.loggedSinceWithDrills', {
                since: langesDatum(stats.loggedSince, uiLanguage),
                reviews: stats.totalReviews,
                drills: stats.totalDrills,
                correct: stats.totalDrillsCorrect,
              })
            : t('chart.loggedSince', {
                since: langesDatum(stats.loggedSince, uiLanguage),
                reviews: stats.totalReviews,
              })
          : t('chart.empty')}
      </ThemedText>
    </ThemedView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      {/* Farbfläche ist Dekoration — die Information trägt der Text daneben. */}
      <View
        style={[styles.swatch, { backgroundColor: color }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * Anstehende Wiederholungen der nächsten sieben Tage — damit man sieht, ob
 * morgen ein großer Berg kommt. Neue Karten zählen nicht mit.
 */
function Forecast({ stats }: { stats: LearningStats }) {
  const toneColor = useToneColor();
  const { t, uiLanguage } = useLocale();
  const max = Math.max(1, ...stats.forecast.map((tag) => tag.due));
  const wochentag = (iso: string, index: number) => {
    if (index === 0) return t('progress.forecastToday');
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTagFor(uiLanguage), { weekday: 'short' })
      .format(new Date(year, month - 1, day, 12));
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('progress.forecastTitle')}</ThemedText>
      <View style={styles.forecast}>
        {stats.forecast.map((tag, index) => (
          <View
            key={tag.date}
            style={styles.barColumn}
            accessible
            accessibilityLabel={t('progress.forecastA11y', {
              date: index === 0 ? t('progress.forecastToday') : tagLabel(tag.date, uiLanguage),
              count: tag.due,
            })}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.barValue}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {tag.due > 0 ? tag.due : ''}
            </ThemedText>
            <View style={styles.barTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View
                style={[
                  styles.barFill,
                  {
                    height: `${(tag.due / max) * 100}%`,
                    backgroundColor: tag.due > 0 ? toneColor(index === 0 ? 'falling' : 'mid') : 'transparent',
                  },
                ]}
              />
            </View>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.barLabel}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {wochentag(tag.date, index)}
            </ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('progress.forecastNote')}
      </ThemedText>
    </ThemedView>
  );
}

/** Übungsart → Übungsmodus im Lern-Reiter (für den „Üben“-Knopf). */
function modusFuer(art: string): Mode | null {
  if (art === 'produktion') return 'sagen';
  if (art === 'dictation') return 'dictation';
  return (DRILLS as readonly string[]).includes(art) ? (art as Mode) : null;
}

/**
 * Trefferquote je Übung im gewählten Lernziel, die schwächste zuerst — mit
 * direktem Weg zum Üben. Zählt erst seit dem 23.09.2026 je Lernziel (ältere
 * Übungen tragen keine Richtung).
 */
function WeakAreas({ stats, direction }: { stats: LearningStats; direction: PairDirection }) {
  const { t } = useLocale();
  const router = useRouter();
  const toneColor = useToneColor();
  const angeboten = new Set(modesForDirection(direction));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('progress.weakTitle')}</ThemedText>
      {stats.directionWindow.total > 0 ? (
        <ThemedText type="small">
          {t('progress.goalAccuracy', {
            correct: stats.directionWindow.correct,
            total: stats.directionWindow.total,
            percent: Math.round((stats.directionWindow.correct / stats.directionWindow.total) * 100),
          })}
        </ThemedText>
      ) : null}
      {stats.weakAreas.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('progress.weakEmpty')}
        </ThemedText>
      ) : (
        stats.weakAreas.map((area) => {
          const modus = modusFuer(area.art);
          const quote = area.correct / area.total;
          const farbe = toneColor(quote < 0.6 ? 'falling' : quote < 0.85 ? 'high' : 'mid');
          return (
            <View key={area.art} style={styles.weakRow}>
              <View style={styles.weakText}>
                <ThemedText type="small">{area.art === 'advanced' ? t('advanced.questions') : modus ? modeLabel(modus, t) : area.art}</ThemedText>
                <View style={styles.meterTrack}>
                  <View style={[styles.meterFill, { width: `${Math.round(quote * 100)}%`, backgroundColor: farbe }]} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('progress.weakRow', { correct: area.correct, total: area.total, percent: Math.round(quote * 100) })}
                </ThemedText>
              </View>
              {modus && angeboten.has(modus) ? (
                <Pressable
                  onPress={() => router.push(`/review?direction=${direction}&mode=${modus}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('progress.weakPractice')}: ${modeLabel(modus, t)}`}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundSelected" style={styles.pill}>
                    <ThemedText type="smallBold">{t('progress.weakPractice')}</ThemedText>
                  </ThemedView>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {t('progress.weakNote')}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Wortschatz-Meilensteine: die ersten 250/500/1000/2000 Wörter (häufige
 * Alltagswörter zuerst). Ein fassbares Ziel statt einer einzigen großen Zahl.
 */
function Milestones({ stats }: { stats: LearningStats }) {
  const { t } = useLocale();
  const toneColor = useToneColor();
  if (stats.milestones.length === 0) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('progress.milestonesTitle')}</ThemedText>
      {stats.milestones.map((stufe) => {
        const anteil = stufe.total > 0 ? stufe.started / stufe.total : 0;
        return (
          <View
            key={stufe.size}
            style={styles.milestone}
            accessible
            accessibilityLabel={`${t('progress.milestoneRow', { size: stufe.total })}: ${t('progress.milestoneValue', { started: stufe.started, total: stufe.total })}`}>
            <View style={styles.row}>
              <ThemedText type="small">{t('progress.milestoneRow', { size: stufe.total })}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('progress.milestoneValue', { started: stufe.started, total: stufe.total })}
              </ThemedText>
            </View>
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  { width: `${Math.round(anteil * 100)}%`, backgroundColor: toneColor(anteil >= 1 ? 'mid' : 'high') },
                ]}
              />
            </View>
          </View>
        );
      })}
      <ThemedText type="small" themeColor="textSecondary">
        {t('progress.milestoneNote')}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Wie das Erarbeitete verteilt ist.
 *
 * SEIT PHASE 18 OHNE DEN ZUSTAND „neu". Er machte am Anfang 100 % aus, und
 * ein Balken, der zu hundert Prozent „noch nicht angefangen" anzeigt, ist
 * keine Fortschrittsanzeige, sondern die Größe des Stapels. Wie viele Karten
 * noch warten, steht darunter als Satz — als Auskunft, nicht als Balken.
 */
function CardStates({ stats }: { stats: LearningStats }) {
  const toneColor = useToneColor();
  const { t } = useLocale();
  const zustaende = CARD_STATE_ORDER.filter((state) => state !== 'new');
  const begonnen = zustaende.reduce((sum, state) => sum + stats.cardStates[state], 0);
  const offen = stats.cardStates.new;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('states.title')}</ThemedText>

      {begonnen === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('states.empty')}
        </ThemedText>
      ) : (
        <>
          {/* Als EINE Ansage statt fünf namenloser Farbsegmente: die Anteile
              stehen ohnehin darunter, hier sagt sie der Screenreader komplett
              (UI-Review 2026-09-07). */}
          <View
            style={styles.stackedBar}
            accessible
            accessibilityLabel={t('states.distributionA11y', {
              parts: zustaende
                .filter((state) => stats.cardStates[state] > 0)
                .map((state) => `${t(STATE_KEYS[state])} ${stats.cardStates[state]}`)
                .join(', '),
            })}>
            {zustaende.map((state) => {
              const count = stats.cardStates[state];
              if (count === 0) return null;
              return (
                <View
                  key={state}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    flexGrow: count,
                    flexBasis: 0,
                    backgroundColor: toneColor(STATE_TONES[state]),
                  }}
                />
              );
            })}
          </View>

          <View style={styles.legend}>
            {zustaende.map((state) => (
              <View key={state} style={styles.legendItem}>
                <View
                  style={[styles.swatch, { backgroundColor: toneColor(STATE_TONES[state]) }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <ThemedText type="small">{t(STATE_KEYS[state])}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {stats.cardStates[state]} ({Math.round((stats.cardStates[state] / begonnen) * 100)}{' '}
                  %)
                </ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {t('states.masteredNote')}
          </ThemedText>
        </>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {offen === 0
          ? t('states.allStarted')
          : t('states.notStarted', { count: offen, total: stats.totalCards })}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    minWidth: 0,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  tileValue: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.half,
    height: 150,
    marginTop: Spacing.one,
  },
  barColumn: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    height: '100%',
  },
  barValue: {
    fontSize: 11,
    lineHeight: 14,
  },
  barTrack: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 11,
    lineHeight: 16,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginTop: Spacing.one,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  forecast: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.half,
    height: 110,
    marginTop: Spacing.one,
  },
  weakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  weakText: {
    flexGrow: 1,
    flexShrink: 1,
    gap: Spacing.half,
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(127,127,127,0.25)',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  milestone: {
    gap: Spacing.half,
  },
  pill: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
