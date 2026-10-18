import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDirectionSummariesFor } from '@/components/direction-dashboard';
import { FeatureLegend } from '@/components/feature-legend';
import { LanguageHero } from '@/components/language-hero';
import { LanguagePicker } from '@/components/language-picker';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { ThemedText } from '@/components/themed-text';

import { Spacing } from '@/constants/theme';
import { useCatalogLanguages } from '@/hooks/use-catalog-languages';
import { useLearnerLanguage } from '@/hooks/use-learner-language';
import { useTheme } from '@/hooks/use-theme';
import { ensureLanguages } from '@/lib/content/catalog-languages';
import { isLanguageLoaded } from '@/lib/content/catalog-state';
import { useLocale } from '@/lib/i18n';
import { featureIsImplemented } from '@/lib/languages/feature';
import { defaultGoalDirection, zieleFuerBruecke, goalLanguage } from '@/lib/languages/goals';
import { learningLanguage } from '@/lib/languages/definitions';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { setReviewSpot } from '@/lib/profile';
import { migrateStore } from '@/lib/storage/migration';

/**
 * Übersicht — Handlung zuerst (UI-Review 2026-09-09): Das Markenwort in seinen
 * Tönen, der Weg in die Sitzung, und erst dann die Auswahl als Abschnitte
 * darunter.
 *
 * Der CTA trägt die fälligen Karten als ehrliche Zahl — nur solange sie
 * geladen ist, nie als Deko: Während des Ladens bleibt der Knopf schlicht, bei
 * null steht „nichts fällig“. Der Zahlenstand wird EINMAL gehoben
 * (`useDirectionSummaries`) und an die Sprachauswahl durchgereicht — seit dem
 * Lernziel-Umbau (Nutzerentscheidung 2026-09-10) hängen die Fällig-Badges an
 * den Ziel-Zeilen des Pickers, eine eigene „Richtungen“-Sektion gibt es nicht
 * mehr.
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
  // Fällig-Zahlen genau für die Ziele dieser Oberfläche.
  const due = useDirectionSummariesFor(ziele.map((ziel) => ziel.direction));
  // Lokale Wahl schlägt das Profil: Sie steht sofort fest, während das
  // Lesezeichen noch geschrieben wird — sonst spränge die Markierung des
  // Deutsch-Ziels (gleiche Profil-Sprache wie Thai) kurz zurück.
  const [wahlRichtung, setWahlRichtung] = useState<PairDirection | null>(null);
  // Dieselbe Regel wie im Ladetor beim Start (`defaultGoalDirection`): So ist
  // die Sprache des vorgewählten Ziels immer schon geladen.
  const selectedDirection = defaultGoalDirection(uiLanguage, profile ?? { language, review: null }, wahlRichtung);

  // Die Beschreibung unter dem Picker hängt am GEWÄHLTEN Ziel: Beim Deutsch-
  // Ziel war sonst der Thai-Tontext zu lesen (gleiche Paarsprache, anderes
  // Ziel — Nutzerhinweis 10.09.). Deutsch hat kein Registry-Merkmal und
  // bekommt einen eigenen Satz; ohne Wahl gilt das erste Ziel der Brücke.
  const aktivesZiel =
    ziele.find(ziel => ziel.direction === selectedDirection) || ziele[0];
  const zielBeschreibung = t(learningLanguage(aktivesZiel.language).feature.description);
  // „Weiter lernen“ öffnet die Sitzung des aktiven Ziels — die Zahl gehört dazu.
  const totalDue =
    due.summaries?.find((item) => item.direction === aktivesZiel.direction)?.due ?? null;
  // Katalog je Lernsprache: Die Sprache des aktiven Ziels bleibt geladen
  // (Merkhilfe, Lern-Reiter). Das Ladetor hat sie beim Start schon geholt.
  useCatalogLanguages([aktivesZiel.language]);
  const [ladeRichtung, setLadeRichtung] = useState<PairDirection | null>(null);
  const [ladeFehler, setLadeFehler] = useState(false);
  const letzteWahl = useRef(0);

  /**
   * Lernziel gewählt: Paarsprache UND Richtung in einem. Reihenfolge ist
   * Bedeutung — `setLanguage` wirft den gemerkten Stand bewusst weg (Geste
   * „von vorn”), erst danach darf die neue Richtung als Lesezeichen
   * (`review` spot) geschrieben werden — bei Kreuzzielen verzichtet das
   * Schreiben bewusst darauf, das Profil trägt nur de-geankerte Stände.
   * Fehler werden geschluckt; navigiert wird über den CTA oben oder den
   * „Lernen”-Knopf der Zeile.
   */
  //
  // Katalog je Lernsprache: Erst wird die Sprachdatei geladen (die Zeile sagt
  // „lädt …“), dann gewählt — so sehen Merkhilfe und Lern-Reiter nie eine
  // leere Sprache. Die bisherige Sprache bleibt geladen, bis eine dritte
  // gebraucht wird. Gilt nur die jeweils letzte Wahl; meldet, ob gewählt wurde.
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
   * Adresse — der Screen liest den Parameter vor dem Profil und wartet nicht
   * auf das (asynchrone) Profil-Schreiben, nur auf die Sprachdatei.
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

  return (
    <ScreenScaffold title={t('tabs.overview')} subtitle={t('home.subtitle')}>
      {/* Der Gruß folgt dem GEWÄHLTEN Ziel: Die gelehrte Sprache des aktiven
          Lernziels entscheidet, welcher Gruß hier steht (Nutzerwunsch
          13.09.) — Thai zeigt die Töne, Deutsch den deutschen Gruß. */}
      <LanguageHero language={goalLanguage(aktivesZiel)} />

      <Link href="/review" asChild>
        {/* accessible: Knopf und Badge sind eine Handlung — der Screenreader
            soll sie als eine Ansage bringen, nicht als zwei Elemente.
            Die Fläche steht bewusst auf dem inneren View, NICHT auf dem
            Pressable: expo-routers asChild-Klon ersetzt den Style des Kindes,
            ein Style am Pressable selbst landet nie im DOM (UI-Review
            2026-09-09, im Web-Build gemessen). */}
        <Pressable
          accessible
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}>
          <View style={[styles.cta, { backgroundColor: theme.accent }]}>
            <ThemedText type="default" style={[styles.ctaLabel, { color: theme.accentText }]}>
              {t('home.heroCta')}
            </ThemedText>
            {totalDue === null ? null : totalDue > 0 ? (
              <View style={[styles.ctaBadge, { borderColor: theme.accentText }]}>
                <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                  {t('home.dueBadge', { count: totalDue })}
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="small" style={{ color: theme.accentText }}>
                {t('home.nothingDue')}
              </ThemedText>
            )}
          </View>
        </Pressable>
      </Link>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('home.sectionLanguages')}
        </ThemedText>
        <LanguagePicker
          // Die Markierung folgt dem AKTIVEN Ziel, nicht der gemerkten Profil-
          // Sprache: Fällt die Richtung auf ein anderes Ziel zurück (gemerktes
          // en_to_de auf der de-Brücke — dort ist Deutsch ausgeblendet),
          // wanderen sonst Radio und Blick (Held/Legende/Beschreibung)
          // auseinander (Nutzerbefund 21.09., Fund 2). `ziel.language` ist
          // genau der Zeilenschlüssel des Pickers (beim Deutsch-Ziel 'th').
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
      </View>

      {/* Seit Phase 18 hat jede Sprache ihre eigene Merkhilfe: Tonfarben bei
          Thai, die Betonungsregel bei Spanisch, die Schriftstueck-Gruppen bei
          Englisch. Vorher stand hier fuer zwei von drei Sprachen nichts - die
          Bedingung war auf die Toene gemuenzt und schloss die anderen aus. */}
      {featureIsImplemented(aktivesZiel.language) ? <FeatureLegend language={aktivesZiel.language} /> : null}

      {/* Die Beschreibung folgt dem GEWÄHLTEN Ziel, nicht der Paarsprache:
          Beim Deutsch-Ziel stand hier sonst der Thai-Tontext (Nutzerhinweis
          10.09.). Deutsch hat kein Registry-Merkmal und bekommt einen eigenen
          Satz; Kreuzziele erben die Beschreibung ihrer Zielsprache. */}
      <ThemedText type="small" themeColor="textSecondary">
        {zielBeschreibung}
      </ThemedText>

      {/* Dezent, ganz unten: welche Sprache das Gerät meldet. Sie ist die
          Brückensprache der App — wer abweichend davon lernt, sieht hier,
          worauf die Voreinstellung beruht. */}
      {/* Nur solange die App-Sprache der Gerätesprache folgt: Bei einer
          eigenen Wahl stand hier „Systemsprache: Deutsch“ unter einer Thai-
          Oberfläche (Testlauf 04.10.2026). */}
      {uiLanguage === systemLanguage ? <ThemedText type="small" themeColor="textSecondary">
        {t('home.systemLanguage', { language: languageName(systemLanguage) })}
      </ThemedText> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  ctaLabel: {
    fontWeight: '700',
  },
  ctaBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
