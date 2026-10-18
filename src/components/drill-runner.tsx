import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText, displayLineHeight } from './themed-text';
import { ThemedView } from './themed-view';
import { ToneContour } from './tone-contour';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hasPronunciationClip, isLanguageAvailable, playPronunciationWithStatus } from '@/lib/audio';
import { buildDrillSession, DrillSession, scoreAnswers } from '@/lib/drills/session';
import { DRILL_META, DrillAnswer, DrillId, DrillQuestion } from '@/lib/drills/types';
import { useLocale, type TranslationKey, type UiLanguage } from '@/lib/i18n';
import { PairDirection, LanguageCode, anchorOf } from '@/lib/languages/types';
import type { LearningStage } from '@/lib/learning-stages';
import { DerivationStep } from '@/lib/reading/syllable';
import { recordDrill } from '@/lib/review-log';

/** Übungs-Namen und -Fragen als Übersetzungsschlüssel statt als deutsche Konstante. */
const DRILL_LABEL_KEYS: Record<DrillId, TranslationKey> = {
  tone: 'drill.tone',
  toneRule: 'drill.toneRule',
  article: 'drill.article',
  verbForms: 'drill.verbForms',
  stressRule: 'drill.stressRule',
  spelling: 'drill.spelling',
  stressHear: 'drill.stressHear',
  soundSpelling: 'drill.soundSpelling',
  deutschLesen: 'drill.deutschLesen',
  polite: 'drill.polite',
  irregularPast: 'drill.irregularPast',
  serEstar: 'drill.serEstar',
  zaehlerwort: 'drill.zaehlerwort',
  konsonantenklasse: 'drill.konsonantenklasse',
  praesensEndung: 'drill.praesensEndung',
  partizip: 'drill.partizip',
};

const DRILL_PROMPT_KEYS: Record<DrillId, TranslationKey> = {
  tone: 'drill.prompt.tone',
  toneRule: 'drill.prompt.toneRule',
  article: 'drill.prompt.article',
  verbForms: 'drill.prompt.verbForms',
  stressRule: 'drill.prompt.stressRule',
  spelling: 'drill.prompt.spelling',
  stressHear: 'drill.prompt.stressHear',
  soundSpelling: 'drill.prompt.soundSpelling',
  // Dieselbe Frage wie bei stressRule — ein Schlüssel, zwei Übungen.
  deutschLesen: 'drill.prompt.deutschLesen',
  polite: 'drill.prompt.polite',
  irregularPast: 'drill.prompt.irregularPast',
  serEstar: 'drill.prompt.serEstar',
  zaehlerwort: 'drill.prompt.zaehlerwort',
  konsonantenklasse: 'drill.prompt.konsonantenklasse',
  praesensEndung: 'drill.prompt.praesensEndung',
  partizip: 'drill.prompt.partizip',
};

/**
 * Eine Übungsrunde.
 *
 * Ablauf je Aufgabe: Frage zeigen (bei der Ton-Übung: abspielen), eine der
 * Antworten wählen, Auflösung sehen, weiter. Es gibt bewusst **keine**
 * Selbsteinschätzung wie beim Karteikasten — die Übungen laufen nicht durch
 * FSRS (AE-16), richtig oder falsch steht ohnehin fest, und eine zusätzliche
 * Frage „wie gut saß das?" wäre hier nur ein Klick ohne Wirkung.
 *
 * Die Auflösung erscheint **immer**, auch nach einer richtigen Antwort: bei
 * einer Auswahl mit drei bis fünf Möglichkeiten ist ein Treffer auch mal
 * geraten, und dann ist die Begründung das eigentlich Nützliche.
 */

export function DrillRunner({
  drill,
  language,
  direction,
  stage,
  onExit,
}: {
  drill: DrillId;
  language: LanguageCode;
  direction?: PairDirection;
  /** Wörter nur aus dieser Stufe (Stufenschalter im Lern-Reiter). */
  stage?: LearningStage;
  onExit: () => void;
}) {
  const meta = DRILL_META[drill];
  const theme = useTheme();
  const { t, uiLanguage } = useLocale();
  // Anker = die Brückenseite der Richtung (21.09.2026): Bedeutungen/Hints
  // lesen in der Sprache der Oberfläche, nicht mehr stur Deutsch.
  const anchor: UiLanguage = direction
    ? anchorOf(direction)
    : (uiLanguage as UiLanguage);

  const [session, setSession] = useState<DrillSession | null>(null);
  const [buildFailed, setBuildFailed] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<DrillAnswer[]>([]);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [heardId, setHeardId] = useState<string | null>(null);
  const [introduced, setIntroduced] = useState(false);
  // Das gelöste Beispiel verbraucht die erste Frage einer Runde; Zähler und
  // Gesamtzahl rechnen es heraus, damit „Aufgabe 1“ die erste eigene ist.
  const [exampleOffset, setExampleOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setBuildFailed(null);
    setIndex(0);
    setExampleOffset(0);
    setChosen(null);
    setAnswers([]);
    setHeardId(null);
    buildDrillSession({ drill, language, direction, anchor, uiLanguage, stage, size: drill === 'polite' ? 5 : undefined, ...(drill === 'tone' ? {
      isEligible: (entry: import('@/data/vocab-types').VocabEntry) => hasPronunciationClip({ text: entry.term, language: 'th', purpose: 'tone' }),
    } : {}) }).then((built) => {
      if (!cancelled) setSession(built);
    }).catch((e) => {
      // Wie im Fortschritts-Reiter: Ohne den Catch bliebe der Spinner für
      // immer stehen, wenn Zusammenstellen oder Speicher scheitern.
      if (!cancelled) setBuildFailed(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [drill, language, direction, anchor, uiLanguage, stage, round]);

  // Jede HOERuebung braucht eine Stimme - seit Phase 18 sind das drei statt
  // einer. Gewarnt wird ausschliesslich bei einem eindeutigen "nein"; siehe
  // isLanguageAvailable.
  useEffect(() => {
    let cancelled = false;
    if (meta.skill !== 'hoeren') {
      setVoiceMissing(false);
      return;
    }
    isLanguageAvailable(language).then((available) => {
      if (!cancelled) setVoiceMissing(available === false);
    });
    return () => {
      cancelled = true;
    };
  }, [meta.skill, language]);

  const question = session?.questions[index] ?? null;

  const answer = useCallback(
    async (optionIndex: number) => {
      if (!question || chosen !== null || (drill === 'tone' && heardId !== question.id)) return;
      const correct = optionIndex === question.correctIndex;
      setChosen(optionIndex);
      setAnswers((previous) => [...previous, { question, chosenIndex: optionIndex, correct }]);
      await recordDrill(correct, Date.now(), undefined, drill, direction).catch(() => {
        // Ein fehlgeschlagener Protokolleintrag darf die Uebung nicht stoppen.
      });
    },
    [question, chosen, drill, heardId]
  );

  const next = useCallback(() => {
    setChosen(null);
    setHeardId(null);
    setIndex((value) => value + 1);
  }, []);

  if (buildFailed) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.loadFailedTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.assembleFailed', { message: buildFailed })}
        </ThemedText>
        <Row>
          <ThemedButton label={t('common.retry')} onPress={() => setRound((value) => value + 1)} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </Row>
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('drill.assembling')}
      </ThemedText>
    );
  }

  if (session.questions.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.noVocab')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {drill === 'tone'
            ? t('drill.toneEmpty')
            : t('drill.noneFor', { drill: t(DRILL_LABEL_KEYS[drill]) })}
        </ThemedText>
        <Row>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </Row>
      </ThemedView>
    );
  }

  if (!question) {
    const score = scoreAnswers(answers);
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.roundDone')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('drill.roundScore', { correct: score.correct, total: score.total })}
        </ThemedText>
        {answers.some((entry) => !entry.correct) ? (
          <View style={styles.mistakes}>
            <ThemedText type="small">{t('drill.mistakesTitle')}</ThemedText>
            {answers
              .filter((entry) => !entry.correct)
              .map((entry) => (
                <View key={entry.question.id}>
                  <ThemedText type="small" themeColor="textSecondary">{entry.question.solution}</ThemedText>
                  {entry.question.solutionRoman ? (
                    <ThemedText type="small" themeColor="textSecondary">{entry.question.solutionRoman}</ThemedText>
                  ) : null}
                </View>
              ))}
          </View>
        ) : null}
        <Row>
          <ThemedButton label={t('drill.newRound')} onPress={() => setRound((value) => value + 1)} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </Row>
      </ThemedView>
    );
  }

  const grammarIntro: Partial<Record<DrillId, TranslationKey>> = {
    article: 'learning.article', verbForms: 'learning.perfect', irregularPast: 'learning.past',
    serEstar: 'learning.serEstar', polite: 'grammar.particleGender',
    zaehlerwort: 'grammar.counterBetween', konsonantenklasse: 'grammar.classIntro',
  };
  const intro = grammarIntro[drill];
  if (intro && !introduced) return <ThemedView type="backgroundElement" style={styles.card}>
    <ThemedText type="smallBold">{t(DRILL_LABEL_KEYS[drill])}</ThemedText>
    <ThemedText>{t(intro)}</ThemedText>
    <ThemedText type="small">{t('learning.example')}</ThemedText>
    <ThemedText>{question.visible}</ThemedText>
    {question.visibleHint ? <ThemedText type="small">{question.visibleHint}</ThemedText> : null}
    <ThemedText type="subtitle">{question.solution}</ThemedText>
    {question.solutionRoman ? <ThemedText type="small">{question.solutionRoman}</ThemedText> : null}
    <ThemedButton label={t('common.next')} onPress={() => { setIntroduced(true); setExampleOffset(1); next(); }} />
    <ThemedButton label={t('common.back')} onPress={onExit} />
  </ThemedView>;

  return (
    <>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('drill.questionProgress', { index: index + 1 - exampleOffset, total: session.questions.length - exampleOffset })}
        </ThemedText>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={t('drill.exit')}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('drill.exit')}
          </ThemedText>
        </Pressable>
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t(DRILL_PROMPT_KEYS[drill])}</ThemedText>

        {question.speak ? (
          <PlayBlock
            key={question.id}
            question={question}
            voiceMissing={voiceMissing}
            onPlayed={setHeardId}
          />
        ) : null}

        {question.visible ? (
          <View style={styles.promptBlock}>
            {/* `thaiMedium` aus der Typo-Skala — bei der Tonübung ist das
                SichtbareThai-Schrift; Zeilenhöhe wächst mit der
                Systemschrift mit (UI-Review 2026-09-07). */}
            <ThemedText
              type="thaiMedium"
              maxFontSizeMultiplier={2}
              style={{ lineHeight: displayLineHeight(32, 2) }}>
              {question.visible}
            </ThemedText>
            {question.visibleRoman && question.visibleRoman !== question.visible ? (
              <ThemedText type="small" themeColor="textSecondary">{question.visibleRoman}</ThemedText>
            ) : null}
            {question.visibleHint ? (
              <ThemedText type="small" themeColor="textSecondary">
                {question.visibleHint}
              </ThemedText>
            ) : null}
            {question.visibleHintRoman ? (
              <ThemedText type="small" themeColor="textSecondary">{question.visibleHintRoman}</ThemedText>
            ) : null}
          </View>
        ) : null}

        <View style={styles.options}>
          {question.options.map((option, optionIndex) => {
            const isChosen = chosen === optionIndex;
            const isCorrect = optionIndex === question.correctIndex;
            const answered = chosen !== null;
            // SEIT DEM UI-REVIEW 2026-09-07 success/error STATT DER TONFARBEN
            // „mittel“/„fallend“: Dieselben Farben für Richtig/Falsch und für
            // Thai-Töne zu verwenden hieß, zwei Bedeutungen in ein Alphabet zu
            // legen — wer Tonerkennung übt, liest sonst Farbcode doppelt.
            const border =
              answered && isCorrect
                ? theme.success
                : answered && isChosen
                  ? theme.error
                  : undefined;

            return (
              <Pressable
                key={`${question.id}:${optionIndex}`}
                onPress={() => answer(optionIndex)}
                disabled={answered || (drill === 'tone' && heardId !== question.id)}
                accessibilityRole="button"
                accessibilityLabel={[option.label, option.roman, option.hint].filter(Boolean).join(', ')}
                accessibilityState={{ selected: isChosen, disabled: answered || (drill === 'tone' && heardId !== question.id) }}
                style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
                <ThemedView
                  type={isChosen ? 'backgroundSelected' : 'background'}
                  style={[
                    styles.option,
                    border ? { borderColor: border, borderWidth: 2 } : styles.optionPlain,
                  ]}>
                  {option.tone ? <ToneContour tone={option.tone} height={16} /> : null}
                  <ThemedText type="small">{option.label}</ThemedText>
                  {option.roman && option.roman !== option.label ? (
                    <ThemedText type="small" themeColor="textSecondary">{option.roman}</ThemedText>
                  ) : null}
                  {/* Seit Phase 16 sichtbar: Bei der Betonungsuebung steht
                      hier die Silbennummer, bei der Ausspracheuebung ein
                      anderes Wort mit demselben Laut. Das Feld gab es seit
                      Phase 6, nur hat es nie jemand angezeigt. */}
                  {option.hint ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.hint}
                    </ThemedText>
                  ) : null}
                </ThemedView>
              </Pressable>
            );
          })}
        </View>

        {chosen !== null ? (
          <ThemedView type="backgroundSelected" style={styles.feedback}>
            {/* Die Farbcodierung des Urteils folgt dem Text: „✓ Richtig“ ist
                grün (success), „✗ Nicht ganz“ rot (error) — beides Token mit
                AA-Kontrast, beide auch ohne Farbe lesbar. */}
            <ThemedText
              type="smallBold"
              themeColor={chosen === question.correctIndex ? 'success' : 'error'}>
              {chosen === question.correctIndex
                ? t('drill.correct')
                : t('drill.wrong')}
            </ThemedText>
            <ThemedText type="small">{question.solution}</ThemedText>
            {question.solutionRoman && question.solutionRoman !== question.solution ? (
              <ThemedText type="small" themeColor="textSecondary">{question.solutionRoman}</ThemedText>
            ) : null}
            {/* Leer = die Erklärung lebt in der Herleitung bzw. gehört dem
                Datensatz der de-Brücke (ser/estar) — dann keine leere Zeile. */}
            {question.explanation ? (
              <ThemedText type="small" themeColor="textSecondary">
                {question.explanation}
              </ThemedText>
            ) : null}
            {question.derivation ? (
              <DerivationBlock steps={question.derivation} uncertain={question.uncertain} />
            ) : null}
          </ThemedView>
        ) : null}
      </ThemedView>

      {chosen !== null ? (
        <ThemedButton label={t('common.next')} onPress={next} variant="primary" />
      ) : null}
    </>
  );
}

/**
 * Der Hörteil der Ton-Übung.
 *
 * Das Wort wird beim Erscheinen einmal abgespielt und lässt sich beliebig oft
 * wiederholen — Töne hört man selten beim ersten Mal.
 */
function PlayBlock({
  question,
  voiceMissing,
  onPlayed,
}: {
  question: DrillQuestion;
  voiceMissing: boolean;
  onPlayed: (id: string) => void;
}) {
  const speak = question.speak!;
  const { t } = useLocale();
  const [hasClip, setHasClip] = useState(false);
  const [label, setLabel] = useState('');
  const purpose = question.drill === 'tone' ? 'tone' as const : 'general' as const;
  useEffect(() => {
    let active = true;
    setHasClip(false);
    hasPronunciationClip({ ...speak, purpose }).then((found) => { if (active) setHasClip(found); });
    return () => { active = false; };
  }, [speak.text, speak.language, purpose]);
  const spokenFor = useRef<string | null>(null);

  const play = useCallback(() => {
    playPronunciationWithStatus({ text: speak.text, language: speak.language, purpose }).then(result => {
      setLabel(result.label);
      if (result.kind !== 'unavailable') onPlayed(question.id);
    }).catch(() => {
      // Eine stumme Ausgabe darf die Uebung nicht abbrechen.
    });
  }, [speak.text, speak.language, purpose, question.id, onPlayed]);

  useEffect(() => {
    if (spokenFor.current === question.id) return;
    spokenFor.current = question.id;
    play();
  }, [question.id, play]);

  return (
    <View style={styles.promptBlock}>
      <Pressable
        onPress={play}
        accessibilityRole="button"
        accessibilityLabel={t('drill.playAgainA11y')}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.playButton}>
          <ThemedText type="smallBold">{t('drill.playAgain')}</ThemedText>
        </ThemedView>
      </Pressable>
      {/* `label` trägt den Wörterbuchschlüssel der Quellen-Zeile (KI-Stimme/
          Systemstimme) — übersetzt im Render, damit auch ein Sprachwechsel
          stimmt (21.09.2026). */}
      {label ? <ThemedText type="small">{t(label as TranslationKey)}</ThemedText> : null}
      {voiceMissing && !hasClip ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {t('drill.voiceMissing', { skill: t('skill.lesen') })}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/**
 * Die Herleitung Schritt fuer Schritt (Phase 13).
 *
 * Der eigentliche Zweck der Uebung „Ton herleiten": Nicht die richtige
 * Antwort zaehlt, sondern der Weg. Deshalb steht hier jeder Schritt mit
 * seinem Wert und seiner Begruendung — wer das dreimal gelesen hat, bestimmt
 * den Ton eines unbekannten Wortes selbst.
 *
 * Als Liste mit `list`-Rolle, damit ein Screenreader die Schritte als
 * zusammenhaengende Folge ansagt und nicht als lose Textfetzen (Phase 9).
 */
function DerivationBlock({
  steps,
  uncertain,
}: {
  steps: DerivationStep[];
  uncertain?: string | null;
}) {
  const { t } = useLocale();
  return (
    <View role="list" accessibilityLabel={t('drill.derivationA11y')} style={styles.derivation}>
      {steps.map((step) => (
        <View key={step.label} role="listitem" style={styles.derivationStep}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.derivationLabel}>
            {step.label}
          </ThemedText>
          <View style={styles.derivationBody}>
            <ThemedText type="smallBold">{step.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {step.detail}
            </ThemedText>
          </View>
        </View>
      ))}
      {uncertain ? (
        <ThemedText type="small" themeColor="textSecondary">
          ⚠ {uncertain}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  derivation: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  derivationStep: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  /** Feste Breite, damit die Schritte als Spalte lesbar sind. */
  derivationLabel: {
    width: 120,
  },
  derivationBody: {
    flex: 1,
    gap: 2,
  },
  /**
   * Mindestgroesse eines Tippziels. WCAG 2.2 verlangt in 2.5.8 (AA) 24x24
   * CSS-Pixel; Apple und Google empfehlen 44 bzw. 48. Gemessen wurde im
   * Web-Build, dass reine Textknoepfe nur 20 Pixel hoch waren - also unter der
   * Norm. 44 ist der bequeme Wert und kostet hier nichts.
   */
  tapTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  promptBlock: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  playButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  optionWrap: {
    flexGrow: 1,
    flexBasis: 120,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  optionPlain: {
    borderWidth: 2,
    borderColor: 'transparent',
  },
  feedback: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  mistakes: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
