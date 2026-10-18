import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { TONE_KEYS } from '@/constants/tones';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import {
  goalEndonym,
  goalLanguage,
  wortschatzFuerZiel,
  zieleFuerBruecke,
  type Lernziel,
} from '@/lib/languages/goals';
import { learningLanguage } from '@/lib/languages/definitions';
import { languageOf } from '@/lib/languages/registry';
import {
  LanguageCode,
  PairDirection,
} from '@/lib/languages/types';
import { downloadPack, megabytes, packsNeeded, refreshPack, usePackStatus } from '@/lib/packs/state';
import { DirectionSummary } from '@/lib/review-session';


/**
 * Die Auswahl als LERNZIELE statt als Richtungen (Nutzerentscheidung
 * 2026-09-10, wörtlich: „Ich wollte dieses ‚Deutsch → Thai‘ und
 * ‚Thai → Deutsch‘ weghaben. Deutsch muss noch als eigene Sprache eingefügt
 * werden.“).
 *
 * SEIT STUFE 1 JE BRÜCKE: Die Zeilen kommen aus `zieleFuerBruecke` — die
 * App-/Oberflächensprache bestimmt die Liste. Brücke Deutsch sieht die vier
 * Bestandsziele wie vorher; Brücken th/en/es sehen ihre Paare, Kreuzziele
 * inklusive.
 *
 * EHRLICH BEI DEN ZAHLEN: Die Fällig-Badges kommen aus den geladenen
 * Summaries (Übersicht lädt ALLE Paarsprachen der Brücke) und erscheinen nur,
 * wo die Zahl wirklich da ist — niemals geraten. Die Wortzahl zählt bei
 * de-geankerten Zielen den Pool, bei Kreuzzielen nur die concept-gekoppelten
 * Paare (`wortschatzFuerZiel`) — kein Eintrag ohne Brückenseite wird
 * mitversprochen.
 *
 * Bauart wie bisher (UI-Review 2026-09-09): aktives Ziel als abgerundete
 * Fläche, die übrigen als offene Zeilen mit Trennlinie.
 *
 * SEIT NUTZERWUNSCH 13.09. MIT DIREKTEM EINSTIEG: Jede Zeile trägt rechts
 * einen „Lernen"-Knopf (`onStart`) — er wählt das Ziel UND öffnet den
 * Lern-Reiter. Zeile und Knopf sind bewusst geschwisterliche Druckflächen
 * statt verschachtelter: So bleibt in der Barrierefreiheit-radio und Knopf
 * zwei getrennte Handlungen, und der Treffer landet garantiert auf dem
 * inneren Element.
 */
export function LanguagePicker({
  selected,
  selectedDirection,
  onSelect,
  onStart,
  due,
  loadingDirection = null,
}: {
  selected: LanguageCode;
  /** Gemerkte Richtung des Profils — entscheidet mit, WELCHES Ziel der Paarsprache aktiv ist. */
  selectedDirection: PairDirection | null;
  /** Wählt ein Ziel; die Richtung trägt Sprache und Lesezeichen zugleich. */
  onSelect: (direction: PairDirection) => void;
  /** Wählt das Ziel und steigt direkt in die Sitzung des Lern-Reiters ein. */
  onStart: (direction: PairDirection) => void;
  /** Geladene Fälligkeitszahlen der Brücke; `null`, solange nichts geladen ist. */
  due: readonly DirectionSummary[] | null;
  /** Ziel, dessen Sprachdatei gerade lädt (Katalog je Lernsprache): Die Zeile sagt es. */
  loadingDirection?: PairDirection | null;
}) {
  const toneColor = useToneColor();
  const theme = useTheme();
  const { t, languageName, uiLanguage } = useLocale();

  const fälligJeRichtung = new Map(
    (due ?? []).map((summary) => [summary.direction, summary.due])
  );
  // Aktives Ziel: die gemerkte Richtung, wenn sie zur gewählten Paar-Sprache
  // gehört, sonst das erste Ziel dieser Sprache — Thai hat mehrere Ziele,
  // darum reicht die Sprache allein nicht als „aktuell“.
  const ziele = zieleFuerBruecke(uiLanguage);
  const zieleDerSprache = ziele.filter((ziel) => ziel.language === selected);
  const aktiveRichtung =
    selectedDirection && zieleDerSprache.some((ziel) => ziel.direction === selectedDirection)
      ? selectedDirection
      : (zieleDerSprache[0]?.direction ?? null);

  return (
    <View role="radiogroup" accessibilityLabel={t('picker.chooseA11y')}>
      {ziele.map((ziel: Lernziel, index: number) => {
        const name = languageName(goalLanguage(ziel));
        const endonym = goalEndonym(ziel);
        const gelehrteSprache = goalLanguage(ziel);
        const wortschatz = wortschatzFuerZiel(ziel);
        const fällig = fälligJeRichtung.get(ziel.direction);
        const active = ziel.direction === aktiveRichtung;
        // Haarlinien nur zwischen offenen Zeilen: Die aktive Zeile ist eine
        // Fläche, und an ihren Kanten wäre die Trennlinie doppelt.
        const previous = index > 0 ? ziele[index - 1] : null;
        const previousActive = previous !== null && previous.direction === aktiveRichtung;
        const showHairline = index > 0 && !active && !previousActive;

        return (
          <View
            key={ziel.direction}
            style={[
              styles.row,
              active && { backgroundColor: theme.backgroundElement },
              showHairline && { borderTopWidth: 1, borderColor: theme.decorGrey },
            ]}>
            <Pressable
              onPress={() => onSelect(ziel.direction)}
              accessibilityRole="radio"
              accessibilityLabel={
                [
                  t('dashboard.cta', { direction: name }),
                  fällig !== undefined ? t('home.dueBadge', { count: fällig }) : null,
                  t('home.vocabCount', { count: wortschatz }),
                  t(languageOf(gelehrteSprache).challenge),
                  t(languageOf(gelehrteSprache).feature.label),
                ]
                  .filter((part): part is string => part !== null)
                  .join(' — ')
              }
              aria-checked={active}
              style={({ pressed }) => [styles.lead, pressed && styles.pressed]}>
              {/* Zwei Zeilen statt einer: Auf 375 px lief „20 fällig“ sonst
                  unter den „Lernen“-Knopf (Testlauf 08.10.2026). */}
              <View style={styles.leadLine}>
              <ThemedText type="default" style={[styles.name, styles.shrink]}>
                {name}
              </ThemedText>
              {/* Bei Deutsch fallen Name und Endonym in eines zusammen. */}
              {endonym !== name ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
                  {endonym}
                </ThemedText>
              ) : null}

              {/* Tonpunkte nur, wenn das Ziel Thai PRODUZIERT — das Merkmal
                  hängt an der hervorgebrachten Sprache, nicht an der Paar-
                  Sprache: th_to_de produziert Deutsch, also keine Punkte;
                  en_to_th produziert Thai, also Punkte. */}
              {learningLanguage(gelehrteSprache).legend === 'tones' ? (
                <View
                  style={styles.dots}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none">
                  {TONE_KEYS.map((tone) => (
                    <View key={tone} style={[styles.dot, { backgroundColor: toneColor(tone) }]} />
                  ))}
                </View>
              ) : null}
              </View>

              <View style={styles.leadLine}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('home.vocabCount', { count: wortschatz })}
              </ThemedText>

              {/* Badge nur, wenn die Zahl wirklich geladen ist — niemals geraten. */}
              {loadingDirection === ziel.direction ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('catalog.loading')}
                </ThemedText>
              ) : fällig !== undefined ? (
                <ThemedView type="accent" style={styles.badge}>
                  <ThemedText type="smallBold" themeColor="accentText">
                    {t('home.dueBadge', { count: fällig })}
                  </ThemedText>
                </ThemedView>
              ) : null}
              </View>
            </Pressable>

            {/* Direkter Einstieg (Nutzerwunsch 13.09.): wählt dieses Ziel und
                öffnet den Lern-Reiter. Im Sprachpaket-Build steht hier zuerst
                „Laden“, solange Hörclips und Bilder der Sprache fehlen. */}
            {packsNeeded() ? (
              <StartOrDownload language={gelehrteSprache} name={name} onStart={() => onStart(ziel.direction)} />
            ) : (
              <StartPill name={name} onStart={() => onStart(ziel.direction)} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function StartPill({ name, onStart }: { name: string; onStart: () => void }) {
  const theme = useTheme();
  const { t } = useLocale();
  return (
    <Pressable
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={`${t('tabs.learn')}: ${name}`}
      style={({ pressed }) => [styles.startPill, { borderColor: theme.decorGrey }, pressed && styles.pressed]}>
      <ThemedText type="smallBold" themeColor="text">
        {t('tabs.learn')}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Sprachpaket fehlt: „Laden · 98 MB“, während des Downloads die Prozentzahl.
 * Ist das Paket da, wieder der normale Einstieg.
 */
function StartOrDownload({ language, name, onStart }: { language: LanguageCode; name: string; onStart: () => void }) {
  const theme = useTheme();
  const { t } = useLocale();
  const status = usePackStatus(language);
  useEffect(() => {
    void refreshPack(language);
  }, [language]);
  if (status.installed !== null && status.phase !== 'error') return <StartPill name={name} onStart={onStart} />;

  const laeuft = status.phase === 'downloading' || status.phase === 'installing';
  const label =
    status.phase === 'downloading'
      ? t('pack.downloading', { percent: Math.round(status.progress * 100) })
      : status.phase === 'installing'
        ? t('pack.installing')
        : status.latest
          ? t('pack.downloadSize', { size: megabytes(status.latest.zipBytes) })
          : t('pack.download');
  return (
    <Pressable
      onPress={() => void downloadPack(language)}
      disabled={laeuft}
      accessibilityRole="button"
      accessibilityLabel={t('pack.downloadA11y', { language: name })}
      accessibilityState={{ busy: laeuft, disabled: laeuft }}
      style={({ pressed }) => [styles.startPill, { borderColor: theme.decorGrey }, pressed && styles.pressed]}>
      <ThemedText type="smallBold" themeColor="text">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
  },
  /** Die Auswahl-Fläche: füllt die Zeile links vom „Lernen"-Knopf. */
  lead: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingVertical: Spacing.two,
  },
  leadLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  /** Direkter Einstieg in die Sitzung — gleiche Zielhöhe wie die Zeile. */
  startPill: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: 999,
  },
  shrink: {
    flexShrink: 1,
  },
  name: {
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
