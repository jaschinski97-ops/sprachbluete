import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LanguagePalette } from './character-palette';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { activeVocabularyFor } from '@/data/active-vocabulary';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { playPronunciationWithStatus } from '@/lib/audio';
import { buildChapterCheck, CHECK_PASS, checkPassed, type CheckQuestion } from '@/lib/chapter-check';
import { daysUntilRecheck, type CheckKind, type CheckRecord } from '@/lib/chapter-recheck';
import { useLocale } from '@/lib/i18n';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import type { LearningChapter } from '@/lib/learning-path';
import { recordWordPractice } from '@/lib/word-practice';
import { compareWriting, type WritingVerdict } from '@/lib/writing/compare';

type Answer = { question: CheckQuestion; correct: boolean };

/**
 * Der Kapitel-Check (08.11.2026, `lib/chapter-check.ts`): Wörter und Sätze
 * des Kapitels, zwei Wörter selbst geschrieben. Beim ersten Mal heißt
 * bestanden abgeschlossen; danach kommt er als Nachtest wieder
 * (`lib/chapter-recheck.ts`), dazwischen ist er ein Übungsdurchgang ohne
 * Folgen. Wortantworten gehen ins Übungsgedächtnis (Auswahl), nie in die Karten.
 */
export function ChapterCheckRunner({
  chapter,
  direction,
  kind,
  record,
  onResult,
  onNextChapter,
  onExit,
}: {
  chapter: LearningChapter;
  direction: PairDirection;
  /** Erster Durchgang, fälliger Nachtest oder Übung. */
  kind: CheckKind;
  /** Der gespeicherte Stand (nächster Nachtest), falls es einen gibt. */
  record: CheckRecord | null;
  /** Speichert das Ergebnis; liefert den neuen Stand. */
  onResult: (kind: CheckKind, passed: boolean) => Promise<CheckRecord | null>;
  onNextChapter: () => void;
  onExit: () => void;
}) {
  const { t, uiLanguage, languageName } = useLocale();
  const theme = useTheme();
  // Die Aussaat bleibt je Versuch fest: Lädt der Bildschirm das Kapitel neu
  // (neues Objekt, gleicher Inhalt), entstehen dieselben Fragen.
  const [seed, setSeed] = useState(() => Date.now());
  // Die Art des Durchgangs steht beim Start fest — nach dem Bestehen wäre
  // das Kapitel sonst mitten im Ergebnis schon ein „Übungsdurchgang“.
  const [runKind, setRunKind] = useState<CheckKind>(kind);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [verdict, setVerdict] = useState<WritingVerdict | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle');
  const [savedRecord, setSavedRecord] = useState<CheckRecord | null>(null);
  const target = targetLanguageOf(direction);
  const questions = useMemo(
    () => buildChapterCheck(chapter, direction, uiLanguage, seed, activeVocabularyFor(target)),
    [chapter, direction, uiLanguage, seed, target]
  );
  const question = started ? questions[index] : undefined;
  const correct = answers.filter((entry) => entry.correct).length;
  const passed = checkPassed(correct, questions.length);
  const over = started && index >= questions.length;
  const answered = question?.kind === 'write' ? verdict !== null : chosen !== null;

  useEffect(() => {
    if (!over || saved !== 'idle') return;
    // Nichts zu speichern: ein Übungsdurchgang oder ein erster Versuch, der nicht reichte.
    if (runKind === 'practice' || (runKind === 'first' && !passed)) {
      setSaved('done');
      return;
    }
    setSaved('saving');
    onResult(runKind, passed).then(
      (next) => { setSavedRecord(next); setSaved('done'); },
      () => setSaved('failed')
    );
  }, [over, passed, runKind, saved, onResult]);

  const remember = (entry: CheckQuestion, right: boolean) => {
    setAnswers((previous) => [...previous, { question: entry, correct: right }]);
    if (entry.vocabId) void recordWordPractice(entry.vocabId, right).catch(() => {});
  };
  const choose = (optionIndex: number) => {
    if (!question || answered) return;
    setChosen(optionIndex);
    remember(question, optionIndex === question.correctIndex);
  };
  const submit = () => {
    if (!question?.writing || answered) return;
    const result = compareWriting(draft, { language: question.writing.language, targets: question.writing.targets });
    setVerdict(result);
    remember(question, result.correct);
  };
  const next = () => {
    setChosen(null);
    setDraft('');
    setVerdict(null);
    setPaletteOpen(false);
    setIndex((value) => value + 1);
  };
  const restart = () => {
    setSeed((value) => value + 1);
    setRunKind(kind);
    setIndex(0);
    setChosen(null);
    setDraft('');
    setVerdict(null);
    setAnswers([]);
    setSaved('idle');
    setSavedRecord(null);
  };

  const nextRecheckLine = (from: CheckRecord | null) => from ? (
    <ThemedText type="small" themeColor="textSecondary">
      {t('chapterCheck.nextRecheck', { days: daysUntilRecheck(from, Date.now()) })}
    </ThemedText>
  ) : null;

  if (questions.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">{t('chapterCheck.empty')}</ThemedText>
        <ThemedButton label={t('common.back')} onPress={onExit} />
      </ThemedView>
    );
  }

  if (!started) {
    const percent = Math.round(CHECK_PASS * 100);
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {t(runKind === 'recheck' ? 'chapterCheck.recheckTitle' : 'chapterCheck.title')}
        </ThemedText>
        <ThemedText type="small">
          {runKind === 'recheck'
            ? t('chapterCheck.recheckIntro', { count: questions.length, percent })
            : runKind === 'practice'
              ? t('chapterCheck.practiceIntro')
              : t('chapterCheck.intro', { count: questions.length, percent })}
        </ThemedText>
        {runKind === 'practice' ? nextRecheckLine(record) : null}
        <ThemedButton label={t('chapterCheck.start')} onPress={() => setStarted(true)} variant="primary" />
      </ThemedView>
    );
  }

  if (over) {
    const wrong = answers.filter((entry) => !entry.correct);
    const message = runKind === 'practice'
      ? t('chapterCheck.practiceDone')
      : runKind === 'recheck'
        ? t(passed ? 'chapterCheck.recheckPassed' : 'chapterCheck.recheckFailed')
        : t(passed ? 'chapterCheck.passed' : 'chapterCheck.failed');
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.resultHead}>
          <Ionicons
            name={passed ? 'checkmark-circle' : 'refresh-circle'}
            size={28}
            color={passed ? theme.success : theme.textSecondary}
          />
          <ThemedText type="smallBold">
            {t('chapterCheck.score', { correct, total: questions.length })}
          </ThemedText>
        </View>
        <ThemedText type="small">{message}</ThemedText>
        {nextRecheckLine(runKind === 'practice' ? record : savedRecord)}
        {saved === 'failed' ? (
          <ThemedText type="small" themeColor="error">{t('chapterCheck.saveFailed')}</ThemedText>
        ) : null}
        {wrong.length > 0 ? (
          <View style={styles.mistakes}>
            <ThemedText type="small" themeColor="textSecondary">{t('drill.mistakesTitle')}</ThemedText>
            {wrong.map(({ question: missed }) => (
              <ThemedText key={missed.id} type="small">
                {missed.prompt} — {missed.writing ? missed.writing.solution : missed.options[missed.correctIndex]}
              </ThemedText>
            ))}
          </View>
        ) : null}
        <View style={styles.row}>
          {runKind === 'first' && passed ? (
            <ThemedButton
              label={t('chapterCheck.nextChapter')}
              onPress={onNextChapter}
              variant="primary"
              disabled={saved === 'saving'}
            />
          ) : !passed ? (
            <ThemedButton label={t('chapterCheck.retry')} onPress={restart} variant="primary" />
          ) : null}
          <ThemedButton
            label={t('common.back')}
            onPress={onExit}
            variant={runKind !== 'first' && passed ? 'primary' : undefined}
            disabled={saved === 'saving'}
          />
        </View>
      </ThemedView>
    );
  }

  if (!question) return null;
  const writing = question.writing;
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {t('chapterCheck.progress', { index: index + 1, total: questions.length })}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {question.kind === 'write'
            ? t('chapterCheck.writePrompt', { language: languageName(target) })
            : t(question.kind === 'word' ? 'chapterCheck.wordPrompt' : 'chapterCheck.sentencePrompt')}
        </ThemedText>
        <View style={styles.prompt}>
          <ThemedText type="subtitle" style={styles.center}>{question.prompt}</ThemedText>
          {question.roman ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{question.roman}</ThemedText>
          ) : null}
          {question.kind !== 'write' ? <ListenButton key={question.id} question={question} direction={direction} /> : null}
        </View>

        {writing ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              editable={!answered}
              placeholder={t('writing.inputA11y')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              // Die Rechtschreibhilfe würde genau die Fehler wegkorrigieren, um die es geht.
              spellCheck={false}
              accessibilityLabel={t('writing.inputA11y')}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            {!answered ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: paletteOpen }}
                  onPress={() => setPaletteOpen((value) => !value)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('writing.paletteToggle')} · {paletteOpen ? '−' : '+'}
                  </ThemedText>
                </Pressable>
                {paletteOpen ? (
                  <LanguagePalette language={writing.language} onInsert={(character) => setDraft((value) => value + character)} />
                ) : null}
                <ThemedButton label={t('writing.check')} onPress={submit} />
              </>
            ) : null}
            {verdict ? (
              <View style={styles.mistakes}>
                <ThemedText type="smallBold" themeColor={verdict.correct ? 'success' : 'error'}>
                  {verdict.exact ? t('drill.exact') : verdict.correct ? t('drill.correct') : t('drill.wrong')}
                </ThemedText>
                {verdict.message ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t(verdict.message.key, verdict.message.params)}
                    {verdict.article ? ` ${t('writing.correctArticle', { article: verdict.article })}` : ''}
                  </ThemedText>
                ) : null}
                <ThemedText type="small">{writing.solution}</ThemedText>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.options}>
              {question.options.map((option, optionIndex) => {
                const isChosen = chosen === optionIndex;
                const isCorrect = optionIndex === question.correctIndex;
                const border = answered && isCorrect ? theme.success : answered && isChosen ? theme.error : undefined;
                return (
                  <Pressable
                    key={`${question.id}:${optionIndex}`}
                    onPress={() => choose(optionIndex)}
                    disabled={answered}
                    accessibilityRole="button"
                    accessibilityLabel={option}
                    accessibilityState={{ selected: isChosen, disabled: answered }}
                    style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
                    <ThemedView
                      type={isChosen ? 'backgroundSelected' : 'background'}
                      style={[styles.option, border ? { borderColor: border } : null]}>
                      <ThemedText type="small" style={styles.center}>{option}</ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </View>
            {chosen !== null ? (
              <ThemedText type="smallBold" themeColor={chosen === question.correctIndex ? 'success' : 'error'}>
                {chosen === question.correctIndex ? t('drill.correct') : t('drill.wrong')}
              </ThemedText>
            ) : null}
          </>
        )}
      </ThemedView>
      {answered ? <ThemedButton label={t('common.next')} onPress={next} variant="primary" /> : null}
    </>
  );
}

/** Wort oder Satz anhören — Sätze spielen beim Erscheinen einmal von selbst. */
function ListenButton({ question, direction }: { question: CheckQuestion; direction: PairDirection }) {
  const { t } = useLocale();
  const theme = useTheme();
  const played = useRef(false);
  const play = useCallback(() => {
    playPronunciationWithStatus({
      text: question.prompt,
      language: targetLanguageOf(direction),
      purpose: question.kind === 'sentence' ? 'sentence' : 'vocabulary',
    }).catch(() => {
      // Eine stumme Ausgabe darf den Check nicht abbrechen.
    });
  }, [question.prompt, question.kind, direction]);
  useEffect(() => {
    if (played.current || question.kind !== 'sentence') return;
    played.current = true;
    play();
  }, [play, question.kind]);
  return (
    <Pressable
      onPress={play}
      accessibilityRole="button"
      accessibilityLabel={t('chapterCheck.listen')}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundSelected" style={styles.listen}>
        <Ionicons name="volume-high" size={16} color={theme.text} />
        <ThemedText type="smallBold">{t('chapterCheck.listen')}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  prompt: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  optionWrap: {
    flexGrow: 1,
    flexBasis: 140,
  },
  option: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
