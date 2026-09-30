import { learningExample } from '@/lib/learning-example';
import type { ConversationSituation } from '@/lib/conversation/types';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { TermWord } from './term-word';

import { SpeechLanguage } from '@/lib/audio';
import { ThemedText, displayLineHeight } from './themed-text';
import { ThemedView } from './themed-view';
import { VerificationBadge } from './verification-badge';
import { VocabImageView } from './vocab-image';

import { Spacing } from '@/constants/theme';
import type { VocabEntry } from '@/data/vocab-types';
import { BridgeEntry } from '@/data/vocab-types';
import { type PlaybackResult, playPronunciationWithStatus } from '@/lib/audio';
import { PairDirection } from '@/lib/fsrs/types';
import { anchorOf } from '@/lib/languages/types';
import { useLocale, type TranslationKey, type UiLanguage } from '@/lib/i18n';
import { useTheme } from '@/hooks/use-theme';

/**
 * Karteikarte.
 *
 * Vorder- und Rückseite tauschen mit der Lernrichtung:
 *   th_to_de — vorne Thai-Schrift mit Umschrift, hinten zusätzlich
 *              Silbenfarben und Bedeutung.
 *   de_to_th — vorne das deutsche Wort samt Grammatik, hinten das thailändische
 *              Wort mit Tonfarben.
 *
 * Die farbige Tonkontur erscheint erst beim Aufdecken; die Umschrift mit
 * Tonzeichen steht auf ausdrücklichen Nutzerwunsch bereits vorn.
 *
 * Das Bild (Phase 5) steht je nach Richtung an anderer Stelle, und zwar aus
 * demselben Grund:
 *   th_to_de — erst beim Aufdecken. Gefragt ist die Bedeutung, und ein Bild
 *              des Gegenstands IST die Bedeutung; vorne wäre es die Lösung.
 *   de_to_th — schon vorne, neben dem deutschen Wort. Gefragt ist hier die
 *              thailändische Form, die das Bild nicht verrät. Es verstärkt nur
 *              den Begriff, von dem aus abgerufen wird — genau der
 *              Dual-Coding-Effekt, wegen dem die Bilder überhaupt entstehen.
 */

type Props = {
  entry: VocabEntry;
  situation?: ConversationSituation;
  /**
   * SEIT DEN KREUZRICHTUNGEN AUF `PairDirection`: Die Karte liest nur die
   * Form der Richtung (`_to_de`); alle de-geankerten Werte verhalten sich
   * exakt wie bisher.
   */
  direction: PairDirection;
  revealed: boolean;
  /**
   * SEIT STUFE 1 (Kreuzrichtungen): die Brückenseite der Karte — der Eintrag
   * der App-/Brückensprache mit demselben `concept`. Nur gesetzt, wenn die
   * Richtung KEIN Deutsch auf einer Seite hat (th↔en, th↔es, en↔es); die
   * de-geankerten Karten bleiben ohne diesen Zweig und verhalten sich exakt
   * wie bisher.
   *
   * SEIT DEM AR-PILOTEN AUCH `BridgeEntry`: Die ar-Brücke kommt aus dem
   * generierten Pool (vocabulary-ar) und ist kein `VocabEntry`. Die Karte
   * liest hier nur `term` — das tragen beide Typen. Die stille VORDERSEITE
   * gilt unverändert auch für ar-Wörter (Audio nur in der Lerntsprache).
   */
  bridgeEntry?: VocabEntry | BridgeEntry | null;
};

export function Flashcard({ entry, direction, revealed, bridgeEntry = null, situation }: Props) {
  // SEIT PHASE 16 AUS DER RICHTUNG STATT AUS EINEM LITERAL: Vorher stand hier
  // `direction === 'th_to_de'`, und eine spanische Karte waere in beiden
  // Richtungen gleich gelaufen.
  const { t, languageName } = useLocale();
  const targetFirst = direction.endsWith('_to_de');
  // Die Ankerseite der Richtung entscheidet, WELCHE Erklärtexte auf die Karte
  // dürfen (21.09.2026): Deutsch nur für de-geankerte Richtungen.
  const anchor = anchorOf(direction);
  const anhoeren = t('flashcard.listenA11y', { language: languageName(entry.language) });

  if (bridgeEntry) {
    // KREUZRICHTUNG: Vorderseite das Brückenwort — STUMM (Nutzerentscheidung
    // 10.09., Audio nur in der Sprache, die man LERNT). Das Bild darf schon
    // vorne stehen wie bei de_to_th: es zeigt den BEGRIFF, nie die Zielform.
    // Die Rückseite bringt ausschließlich Zielsprache (+ Umschrift/Lautschrift
    // über `TermWord`); deutsche Erklärtexte und die deutsche Gerätestimme
    // haben hier nichts verloren, denn die Brücke ist ja keine deutsche.
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.frontBridge}>
          <ThemedText
            maxFontSizeMultiplier={2}
            style={[styles.bridgeLarge, { lineHeight: displayLineHeight(34, 2, 1.35) }]}>
            {bridgeEntry.term}
          </ThemedText>
        </View>
        <VocabImageView entry={entry} />
        {revealed ? (
          <>
            <TermWord entry={entry} />
            <SpeakButton
              label={anhoeren}
              text={entry.term}
              language={entry.language}
              assetId={entry.audioAssetId}
            />
          </>
        ) : null}
        {revealed ? <ExampleBlock entry={entry} anchor={anchor} situation={situation} /> : null}
        {revealed ? <VerificationBadge entry={entry} /> : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {targetFirst ? (
        <>
          {revealed ? (
            <TermWord entry={entry} />
          ) : (
            <View style={styles.frontThai}>
              {/* Gleiche Stufe und gleicher Skalierungsschutz wie in `ThaiWord`;
                  die Umschrift steht direkt unter der Thai-Schrift. */}
              <ThemedText
                type="thaiLarge"
                maxFontSizeMultiplier={1.4}
                style={{ lineHeight: displayLineHeight(56, 1.4) }}>
                {entry.term}
              </ThemedText>
              {entry.language === 'th' && entry.romanization && entry.romanization !== entry.term ? (
                <ThemedText type="small" themeColor="textSecondary">{entry.romanization}</ThemedText>
              ) : null}
            </View>
          )}
          {/* Audio nur in der Sprache, die man LERNT (Nutzerentscheidung
              10.09.): Die Vorderseite einer X_to_de-Karte steht in der
              Brückensprache — die bleibt stumm, auch nach dem Aufdecken.
              Deutsch wird nach dem Aufdecken über die Gerätestimme vorgelesen
              (keine Clips, denn der Clip-Bestand ist zielsprachlich). */}
          {revealed ? (
            <>
              <VocabImageView entry={entry} />
              <GermanBlock entry={entry} />
              <SpeakButton
                label={t('flashcard.listenGermanA11y')}
                text={entry.german}
                language="de"
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          <VocabImageView entry={entry} />
          <GermanBlock entry={entry} headline />
          {/* Kein Deutsch-Button auf der Vorderseite: Gehört wird nur die
              Lerntsprache (Nutzerentscheidung 10.09.). */}
          {revealed ? (
            <>
              <TermWord entry={entry} />
              <SpeakButton
                label={anhoeren}
                text={entry.term}
                language={entry.language}
                assetId={entry.audioAssetId}
              />
            </>
          ) : null}
        </>
      )}

      {revealed ? <ExampleBlock entry={entry} anchor={anchor} situation={situation} /> : null}
      {revealed ? <VerificationBadge entry={entry} /> : null}
    </ThemedView>
  );
}

function GermanBlock({ entry, headline = false }: { entry: VocabEntry; headline?: boolean }) {
  const { t } = useLocale();
  if (entry.german === entry.term) return null;
  const chips: string[] = [];
  if (entry.germanNoun) {
    chips.push(t('flashcard.plural', { plural: entry.germanNoun.plural }));
  }
  if (entry.germanVerb) {
    chips.push(
      `${entry.germanVerb.thirdPerson} · ${entry.germanVerb.praeteritum} · ${entry.germanVerb.perfekt}`
    );
  }
  if (entry.germanAdjective) {
    chips.push(
      `${entry.germanAdjective.comparative} · ${entry.germanAdjective.superlative}`
    );
  }

  return (
    <View style={styles.germanBlock}>
      <ThemedText
        maxFontSizeMultiplier={2}
        style={[
          headline
            ? { ...styles.germanLarge, lineHeight: displayLineHeight(34, 2, 1.35) }
            : { ...styles.germanMedium, lineHeight: displayLineHeight(24, 2, 1.41) },
        ]}>
        {entry.german}
      </ThemedText>
      {chips.map((chip) => (
        <ThemedText key={chip} type="small" themeColor="textSecondary" style={styles.center}>
          {chip}
        </ThemedText>
      ))}
      {entry.note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {entry.note}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Der Beispielblock - seit Phase 16 nur, wenn ein Beispiel vorliegt.
 *
 * Fuer Englisch und Spanisch gibt es keine erfundenen Saetze; die Karte zeigt
 * dort stattdessen nichts, statt eine leere Zeile mit Lautsprechersymbol.
 */
function ExampleBlock({ entry, anchor, situation }: { entry: VocabEntry; anchor: UiLanguage; situation?: ConversationSituation }) {
  const { t } = useLocale();
  const example = learningExample(entry, anchor, situation);
  if (!example) return null;
  return <ThemedView type="backgroundSelected" style={styles.example}>
    <View style={styles.exampleRow}>
      <View style={styles.exampleText}>
        <ThemedText type="small">{example.text}</ThemedText>
        {entry.language === 'th' && example.roman ? <ThemedText type="small">{example.roman}</ThemedText> : null}
        {example.meaning !== example.text ? <ThemedText type="small" themeColor="textSecondary">{example.meaning}</ThemedText> : null}
      </View>
      <SpeakButton label="▶" spokenLabel={t('flashcard.listenExampleA11y')} text={example.text} language={entry.language} compact />
    </View>
  </ThemedView>;
}

/**
 * Aussprache-Knopf.
 *
 * `spokenLabel` gibt es, weil die kompakte Fassung nur ein Lautsprecher-Symbol
 * zeigt. Ohne eigene Beschriftung läse ein Screenreader entweder gar nichts
 * oder — als Textzeichen — „schwarzes rechtsweisendes Dreieck“; beides sagt
 * niemandem, was der Knopf tut (Phase 9). Die Vorlesetaste ist ausserdem
 * mindestens 44 Punkte gross, damit sie auch mit dem Daumen zu treffen ist.
 *
 * Das Symbol ist ein Icon aus @expo/vector-icons statt des früheren 🔊-Emoji:
 * Emojis kommen aus der Systememencharge und sehen je Plattform (und je
 * fehlender Emoji-Font) unterschiedlich bis gar nicht aus; der Icon-Glyph ist
 * überall derselbe und folgt der Textfarbe des Themas.
 */
function SpeakButton({
  label,
  spokenLabel,
  text,
  language,
  assetId,
  compact = false,
}: {
  label: string;
  /** Was der Screenreader sagt, wenn das Sichtbare nur ein Zeichen ist. */
  spokenLabel?: string;
  text: string;
  language: SpeechLanguage;
  assetId?: string;
  compact?: boolean;
}) {
  const [played, setPlayed] = useState<{ text: string; result: PlaybackResult } | null>(null);
  const playback = played?.text === text ? played.result : null;
  const colors = useTheme();
  // `playback.label` trägt den Wörterbuchschlüssel der Quellen-Zeile
  // (KI-Stimme/Systemstimme) — hier übersetzt (21.09.2026).
  const { t } = useLocale();

  return (
    <View style={compact ? undefined : styles.speakColumn}>
      <Pressable
        onPress={() => {
          // Absichtlich ohne await: die Karte soll nicht auf die Sprachausgabe
          // warten. Fehler (z. B. keine Thai-Stimme installiert) dürfen den
          // Lernfluss nicht unterbrechen.
          playPronunciationWithStatus({ text, language, audioAssetId: assetId, purpose: compact ? 'sentence' : 'vocabulary' })
            .then(result => setPlayed({ text, result }))
            .catch(() => {});
        }}
        accessibilityRole="button"
        accessibilityLabel={`${spokenLabel ?? label}: ${text}${
          playback ? ` (${t(playback.label as TranslationKey)})` : ''
        }`}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView
          type="backgroundSelected"
          style={compact ? styles.speakCompact : styles.speakButton}>
          {compact ? (
            <Ionicons
              name="volume-medium-outline"
              size={17}
              color={colors.textSecondary}
            />
          ) : (
            <View style={styles.speakLabel}>
              <Ionicons
                name="volume-medium-outline"
                size={17}
                color={colors.textSecondary}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {label}
              </ThemedText>
            </View>
          )}
        </ThemedView>
      </Pressable>
      {/* Pflicht 4 (Phase 11): Ein Clip ist eine KI-Stimme. Das steht genau
          dann da, wenn einer gespielt hat - nicht als Dauerhinweis, der bald
          niemand mehr liest, und nicht bei der Sprachausgabe des Geraets, die
          ohnehin als solche erkennbar ist. */}
      {playback ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.syntheticNote}>
          {t(playback.label as TranslationKey)}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Kleinste sinnvolle Grösse eines Tippziels. */
export const MIN_TOUCH = 44;

const styles = StyleSheet.create({
  speakColumn: {
    gap: 2,
  },
  syntheticNote: {
    fontSize: 11,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  frontThai: {
    paddingVertical: Spacing.three,
  },
  /** Vorderseite der Kreuzkarte: das Brückenwort in Displaygröße (stumm). */
  frontBridge: {
    paddingVertical: Spacing.three,
  },
  bridgeLarge: {
    fontSize: 34,
    fontWeight: '600',
    textAlign: 'center',
  },
  germanBlock: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  germanLarge: {
    fontSize: 34,
    fontWeight: '600',
    textAlign: 'center',
  },
  germanMedium: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  example: {
    width: '100%',
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exampleText: {
    flexShrink: 1,
    flexGrow: 1,
    gap: 2,
  },
  speakButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  /** Icon und Beschriftung als Zeile, wie im Mockup die Audio-Pille. */
  speakLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  speakCompact: {
    // Mindestens 44 Punkte in beide Richtungen - unter diesem Mass ist ein
    // Ziel mit dem Daumen kaum zu treffen (Apple HIG 44 pt, Android 48 dp).
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
