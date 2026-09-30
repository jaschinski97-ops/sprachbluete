import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ADVANCED_LESSONS } from '@/data/advanced-lessons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import { hasPronunciationClip, isLanguageAvailable, playPronunciationWithStatus, stopPronunciation } from '@/lib/audio';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { readMeta, writeMeta } from '@/lib/repository';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Phase = 'listen' | 'questions' | 'read' | 'produce';

function draftKey(direction: PairDirection, id: string): string {
  return `advanced-lesson:${direction}:${id}:draft`;
}

function doneKey(direction: PairDirection, id: string): string {
  return `advanced-lesson:${direction}:${id}:done`;
}

/** An offline practice unit. Open answers receive a model and a self-check,
 * never an invented semantic score. The only stored text is the local draft.
 */
export function AdvancedLessonRunner({ direction, onExit }: { direction: PairDirection; onExit: () => void }) {
  const { t } = useLocale();
  const colors = useTheme();
  const lesson = ADVANCED_LESSONS[targetLanguageOf(direction)];
  const [phase, setPhase] = useState<Phase>('listen');
  const [listenIndex, setListenIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasPronunciationClip({ text: lesson.paragraphs[listenIndex], language: lesson.language, purpose: 'sentence' })
      .then(available => { if (!cancelled) setAudioUnavailable(!available); });
    return () => { cancelled = true; };
  }, [lesson.language, lesson.paragraphs, listenIndex]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readMeta(draftKey(direction, lesson.id), ''),
      readMeta(doneKey(direction, lesson.id), false),
    ]).then(([previousDraft, previousDone]) => {
      if (cancelled) return;
      setDraft(previousDraft);
      setCompleted(previousDone);
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; void stopPronunciation(); };
  }, [direction, lesson.id]);

  const play = useCallback((paragraph: string) => {
    setPlaying(true);
    setAudioUnavailable(false);
    void (async () => {
      try {
        const request = { text: paragraph, language: lesson.language, purpose: 'sentence' as const };
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(lesson.language) === false) {
          setAudioUnavailable(true);
          return;
        }
        const result = await playPronunciationWithStatus(request);
        if (result.kind === 'unavailable') setAudioUnavailable(true);
      } catch {
        setAudioUnavailable(true);
      } finally {
        setPlaying(false);
      }
    })();
  }, [lesson.language]);

  const nextQuestion = () => {
    if (selected === lesson.questions[questionIndex].correctIndex) setCorrect((value) => value + 1);
    setSelected(null);
    if (questionIndex + 1 < lesson.questions.length) setQuestionIndex((value) => value + 1);
    else setPhase('read');
  };

  if (!ready) return <ThemedText type="small" themeColor="textSecondary">{t('round.assembling')}</ThemedText>;

  return <View style={styles.root}>
    <ThemedText type="subtitle">{lesson.title}</ThemedText>
    {lesson.roman ? <RomanLine text={lesson.roman.title} /> : null}
    <ThemedText type="small" themeColor="textSecondary">{t('advanced.intro')}</ThemedText>

    {phase === 'listen' ? <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('advanced.listen', { index: listenIndex + 1, total: lesson.paragraphs.length })}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('advanced.audioNote')}</ThemedText>
      <ThemedButton
        label={t('advanced.listen', { index: listenIndex + 1, total: lesson.paragraphs.length })}
        disabled={playing}
        variant="primary"
        onPress={() => play(lesson.paragraphs[listenIndex])}
      />
      {audioUnavailable ? <>
        <ThemedText type="small" themeColor="textSecondary">{t('advanced.read')} · {t('advanced.audioNote')}</ThemedText>
        <ThemedText type="default">{lesson.paragraphs[listenIndex]}</ThemedText>
        {lesson.roman ? <RomanLine text={lesson.roman.paragraphs[listenIndex]} /> : null}
      </> : null}
      <ThemedButton label={t('common.next')} onPress={() => {
        void stopPronunciation();
        if (listenIndex + 1 < lesson.paragraphs.length) setListenIndex((value) => value + 1);
        else setPhase('questions');
      }} />
    </ThemedView> : null}

    {phase === 'questions' ? <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('advanced.questions')} · {questionIndex + 1}/{lesson.questions.length}</ThemedText>
      <ThemedText type="default">{lesson.questions[questionIndex].prompt}</ThemedText>
      {lesson.questions[questionIndex].roman ? <RomanLine text={lesson.questions[questionIndex].roman.prompt} /> : null}
      {lesson.questions[questionIndex].options.map((option, index) => <Pressable
        key={option}
        accessibilityRole="button"
        disabled={selected !== null}
        onPress={() => setSelected(index)}>
        <ThemedView type={selected === index ? 'backgroundSelected' : 'background'} style={styles.option}>
          <ThemedText type="default">{option}</ThemedText>
          {lesson.questions[questionIndex].roman ? <RomanLine text={lesson.questions[questionIndex].roman.options[index]} /> : null}
        </ThemedView>
      </Pressable>)}
      {selected !== null ? <>
        <ThemedText type="smallBold" style={{ color: selected === lesson.questions[questionIndex].correctIndex ? colors.accent : colors.text }}>
          {selected === lesson.questions[questionIndex].correctIndex ? t('sentence.correct') : t('drill.wrong')}
        </ThemedText>
        <ThemedText type="small">{lesson.questions[questionIndex].explanation}</ThemedText>
        {lesson.questions[questionIndex].roman ? <RomanLine text={lesson.questions[questionIndex].roman.explanation} /> : null}
        <ThemedButton label={t('common.next')} onPress={nextQuestion} />
      </> : null}
    </ThemedView> : null}

    {phase === 'read' ? <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('advanced.read')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('advanced.score', { correct, total: lesson.questions.length })}
      </ThemedText>
      {lesson.paragraphs.map((paragraph, index) => <View key={index} style={styles.paragraph}>
        <ThemedText type="default">{paragraph}</ThemedText>
        {lesson.roman ? <RomanLine text={lesson.roman.paragraphs[index]} /> : null}
        <ThemedButton label={t('advanced.listen', { index: index + 1, total: lesson.paragraphs.length })} onPress={() => play(paragraph)} />
      </View>)}
      {audioUnavailable ? <ThemedText type="small" themeColor="textSecondary">{t('advanced.unavailable')}</ThemedText> : null}
      <ThemedButton label={t('common.next')} variant="primary" onPress={() => { void stopPronunciation(); setPhase('produce'); }} />
    </ThemedView> : null}

    {phase === 'produce' ? <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('advanced.write')}</ThemedText>
      <ThemedText type="default">{lesson.writingPrompt}</ThemedText>
      {lesson.roman ? <RomanLine text={lesson.roman.writingPrompt} /> : null}
      <TextInput
        multiline
        accessibilityLabel={t('advanced.write')}
        value={draft}
        onChangeText={(value) => { setDraft(value); setSaved(false); }}
        textAlignVertical="top"
        style={[styles.input, { color: colors.text, borderColor: colors.borderSubtle }]}
      />
      <ThemedButton label={t('advanced.save')} disabled={!draft.trim()} onPress={() => {
        setSaveError(null);
        void writeMeta(draftKey(direction, lesson.id), draft)
          .then(() => setSaved(true))
          .catch((error) => setSaveError(String(error)));
      }} />
      {saved ? <ThemedText type="small" themeColor="textSecondary">{t('advanced.saved')}</ThemedText> : null}
      {saveError ? <ThemedText type="small" themeColor="textSecondary">{t('common.loadFailed', { message: saveError })}</ThemedText> : null}
      <ThemedText type="smallBold">{t('advanced.speak')}</ThemedText>
      <ThemedText type="default">{lesson.speakingPrompt}</ThemedText>
      {lesson.roman ? <RomanLine text={lesson.roman.speakingPrompt} /> : null}
      <ThemedText type="small" themeColor="textSecondary">{t('advanced.selfCheck')}</ThemedText>
      <ThemedButton label={t('advanced.model')} onPress={() => setShowModel((value) => !value)} />
      {showModel ? <ThemedText type="default">{lesson.modelAnswer}</ThemedText> : null}
      {showModel && lesson.roman ? <RomanLine text={lesson.roman.modelAnswer} /> : null}
      <ThemedButton label={completed ? t('advanced.done') : t('advanced.complete')}
        disabled={completed || !draft.trim()}
        variant="primary"
        onPress={() => {
          setSaveError(null);
          void (async () => {
            try {
              await writeMeta(draftKey(direction, lesson.id), draft);
              await writeMeta(doneKey(direction, lesson.id), true);
              setSaved(true);
              setCompleted(true);
            } catch (error) {
              setSaveError(String(error));
            }
          })();
        }} />
    </ThemedView> : null}
    <ThemedButton label={t('common.back')} onPress={onExit} />
  </View>;
}

function RomanLine({ text }: { text: string }) {
  return <ThemedText type="small" themeColor="textSecondary">{text}</ThemedText>;
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  option: { borderRadius: Spacing.two, padding: Spacing.three, minHeight: 44 },
  paragraph: { gap: Spacing.one },
  input: { borderWidth: 1, borderRadius: Spacing.two, minHeight: 160, padding: Spacing.three },
});
