import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { MeasuredToneContour } from './measured-tone-contour';
import { ThemedText, displayLineHeight } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sentenceFootnote, type SatzSprache } from '@/data/sentence-tasks';
import type { VocabEntry } from '@/data/vocab-types';
import { useMicrophoneCapture } from '@/hooks/use-microphone-capture';
import { hasPronunciationClip, isLanguageAvailable, playPronunciationWithStatus, stopPronunciation } from '@/lib/audio';
import { useLocale, type UiLanguage } from '@/lib/i18n';
import type { CapturedPcm } from '@/lib/speaking';
import { MIC_ERROR_KEYS } from '@/lib/speaking/mic-error-keys';
import { measureSentence, preparationRemaining, sentenceAnswers, sentenceSession,
  SENTENCE_WINDOWS_MS, type SentenceMeasurement, type SentenceMode } from '@/lib/speaking/sentence-session';

export function SentenceAction({ label, onPress, disabled = false }: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  // Rahmen über das `borderSubtle`-Token statt hart codiertem #888888: der
  // bekam im Dunkelmodus nie eine eigene Fassung (UI-Review 2026-09-07).
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.action, { borderColor: theme.borderSubtle, opacity: disabled ? .45 : pressed ? .65 : 1 }]}>
    <ThemedText type="smallBold">{label}</ThemedText>
  </Pressable>;
}


export function SentenceRunner({ mode, language, anchor = 'de', words, onExit }: {
  mode: SentenceMode; language: SatzSprache; /** Anker-/Bedeutungsseite der Richtung (21.09.2026). */ anchor?: UiLanguage; words?: VocabEntry[]; onExit: () => void;
}) {
  const { t, uiLanguage, languageName } = useLocale();
  // Die Aussaat ist ein eigener Zustand: „Neue Runde“ würfelt sie neu, damit
  // nicht dieselbe Satzfolge und Antwortmischung wie in der Runde davor
  // herauskommt.
  const [seed, setSeed] = useState(() => Date.now());
  const tasks = useMemo(() => sentenceSession(language, seed, anchor, words), [language, seed, anchor, words]);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [preparedAt, setPreparedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [heard, setHeard] = useState(false);
  const [headphones, setHeadphones] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<SentenceMeasurement | null>(null);
  const [stage, setStage] = useState<'prepare' | 'record' | 'result'>('prepare');
  const [hintOpen, setHintOpen] = useState(false);
  const listening = mode === 'sentenceListening';
  const task = tasks[index];
  const windowMs = mode === 'sentenceRepeat' ? SENTENCE_WINDOWS_MS[round] : 15_000;
  const capture = useMicrophoneCapture({ maxDurationMs: windowMs, allowPlayback: mode === 'shadowing' });
  const captureRef = useRef(capture); captureRef.current = capture;
  const generation = useRef(0);
  const locked = useRef(false);
  const processed = useRef(new WeakSet<CapturedPcm>());
  const active = useRef(false);
  const stageRef = useRef(stage); stageRef.current = stage;
  const remaining = preparationRemaining(preparedAt, now);

  // Die Uhr wird nur gebraucht, solange der Vorbereitungs-Countdown der
  // Sprechübungen sichtbar ist; in der Hörübung und in der Ergebnisstufe läuft
  // kein Intervall.
  const countingDown = !listening && stage === 'prepare';
  useEffect(() => {
    if (!countingDown) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [countingDown]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      generation.current++; active.current = false; locked.current = false;
      captureRef.current.cancel(); void stopPronunciation();
      setBusy(false); setStage('prepare'); setResult(null); setHeard(false);
      setPreparedAt(Date.now()); setNow(Date.now());
      setNotice(t('sentence.interrupted'));
    });
    return () => {
      sub.remove(); generation.current++; active.current = false;
      captureRef.current.cancel(); void stopPronunciation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function play(concurrentRecording = false): Promise<boolean> {
    const turn = generation.current;
    const label = languageName(language);
    const request = { text: task.text, language, purpose: 'sentence' as const };
    if (!await hasPronunciationClip(request) && await isLanguageAvailable(language) === false) {
      if (turn === generation.current) setNotice(t('sentence.noVoice', { language: label }));
      return false;
    }
    if (turn !== generation.current) return false;
    const playback = await playPronunciationWithStatus({ ...request, ...(concurrentRecording ? { concurrentRecording: true } : {}) });
    if (turn !== generation.current) { await stopPronunciation(); return false; }
    setNotice(playback.kind === 'asset' ? t('sentence.audioClip') : playback.kind === 'tts' ? t('sentence.audioSystem') : t('sentence.noVoice', { language: label }));
    return playback.kind !== 'unavailable';
  }

  async function listen() {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const turn = generation.current;
    try { if (await play() && turn === generation.current) setHeard(true); }
    catch { if (turn === generation.current) setNotice(t('sentence.playFailed')); }
    finally { if (turn === generation.current) { locked.current = false; setBusy(false); } }
  }

  async function finish(recording: CapturedPcm) {
    if (!active.current || processed.current.has(recording)) return;
    processed.current.add(recording); active.current = false;
    const turn = generation.current;
    setBusy(true); locked.current = true;
    await stopPronunciation();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
      if (turn !== generation.current) return;
      setResult(measureSentence(recording)); setStage('result');
    } catch { if (turn === generation.current) { setNotice(t('sentence.measureFailed')); setStage('prepare'); } }
    finally {
      if (turn === generation.current) { captureRef.current.clear(); setBusy(false); locked.current = false; }
    }
  }
  useEffect(() => {
    if (capture.lastCapture) void finish(capture.lastCapture);
    // finish uses refs so a changed capture controller cannot process PCM twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.lastCapture]);

  async function start() {
    // Enforce in the handler too; a stale enabled button cannot skip planning.
    if (locked.current || stageRef.current !== 'prepare' || preparationRemaining(preparedAt, Date.now()) > 0 ||
      !heard || (mode === 'shadowing' && !headphones)) return;
    locked.current = true; setBusy(true);
    const turn = generation.current;
    await stopPronunciation();
    const started = await captureRef.current.start();
    if (turn !== generation.current) { captureRef.current.cancel(); return; }
    if (!started) { locked.current = false; setBusy(false); return; }
    active.current = true; setResult(null); setStage('record');
    try {
      if (mode === 'shadowing' && !await play(true)) {
        active.current = false; captureRef.current.cancel(); setStage('prepare');
      }
    } catch {
      active.current = false; captureRef.current.cancel(); setStage('prepare');
      setNotice(t('sentence.modelFailed'));
    } finally { if (turn === generation.current) { setBusy(false); locked.current = false; } }
  }
  async function stop() {
    if (!active.current || locked.current) return;
    const recording = await captureRef.current.stop();
    if (recording) await finish(recording);
    else { active.current = false; setStage('prepare'); }
  }
  function reset(nextIndex: number, nextRound = 0) {
    generation.current++; active.current = false; locked.current = false;
    captureRef.current.cancel(); captureRef.current.clear(); void stopPronunciation();
    setIndex(nextIndex); setRound(nextRound); setHeard(false); setAnswer(null);
    setResult(null); setBusy(false); setStage('prepare'); setNotice('');
    setPreparedAt(Date.now()); setNow(Date.now());
  }
  // Eine Sprache ohne geprüfte Sätze bekommt keinen vorgetäuschten Ablauf:
  // kein Mikrofon, keine Wiedergabe — nur der ehrliche Hinweis, was fehlt
  // (AE-66). Sobald die Registry Satzstoff führt, läuft alles wie bei Thai.
  if (tasks.length === 0) return <ThemedView style={styles.card}>
    <ThemedText type="subtitle">{t('sentence.noneFor', { language: languageName(language) })}</ThemedText>
    <ThemedText type="small">{sentenceFootnote(language, uiLanguage)}</ThemedText>
    <SentenceAction label={t('common.back')} onPress={onExit} />
  </ThemedView>;

  if (!task) return <ThemedView style={styles.card}>
    <ThemedText type="subtitle">{t('drill.roundDone')}</ThemedText>
    <ThemedText>{listening
      ? t('sentence.listeningSummary', { correct, total: tasks.length })
      : t('sentence.spokenSummary', { total: tasks.length })}</ThemedText>
    <ThemedText type="small">{t('sentence.limits')}</ThemedText>
    <SentenceAction label={t('drill.newRound')} onPress={() => { setCorrect(0); setSeed(Date.now()); reset(0); }} />
    <SentenceAction label={t('common.back')} onPress={onExit} />
  </ThemedView>;

  return <ThemedView style={styles.card} type="backgroundElement">
    <View style={styles.row}><ThemedText type="small">{t('sentence.progress', { index: index + 1, total: tasks.length })}</ThemedText>
      <SentenceAction label={t('sentence.exit')} onPress={onExit} /></View>
    <ThemedText type="subtitle">{listening ? t('mode.sentenceListening') : mode === 'shadowing' ? t('sentence.titleShadowing') : t('sentence.titleRepeat')}</ThemedText>
    {mode === 'sentenceRepeat' && <ThemedText type="small">{t('sentence.roundHint', { round: round + 1 })}</ThemedText>}
    {/* Die mehrsätzigen Methodik-Hinweise stehen bewusst NICHT mehr bei jedem
        Satz im Lernfluss: Sie wiederholen sich, der Lernende will den Satz. */}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: hintOpen }}
      accessibilityLabel={t('sentence.hintA11y')} onPress={() => setHintOpen(value => !value)}
      style={styles.toggle}>
      <ThemedText type="small" themeColor="textSecondary">{hintOpen ? t('sentence.hintHide') : t('sentence.hintShow')}</ThemedText>
    </Pressable>
    {hintOpen && <>
      <ThemedText type="small">{t('sentence.limits')}</ThemedText>
      {!listening && <ThemedText type="small">{mode === 'sentenceRepeat'
        ? t('sentence.hintRepeat')
        : t('sentence.hintShadowing')}</ThemedText>}
    </>}
    {!listening && <>
      {/* Die deutsche Satzbedeutung nur auf der de-Brücke: Andere Anker haben
          keine Satzübersetzung im Bestand — der Fokus-Hinweis (wortweise
          übersetzt) bleibt die ehrliche Verständnishilfe (21.09.2026). */}
      {anchor === 'de' && <ThemedText type="smallBold">{task.german}</ThemedText>}
      {/* Der Thai-Satz in Displaygröße: Skalierungsdeckel wie überall, sonst
          schneiden Zeilenhöhe und Tonzeichen einander (UI-Review 2026-09-07). */}
      {(stage !== 'record' || mode === 'shadowing') && <><ThemedText type="subtitle" maxFontSizeMultiplier={2} style={{ lineHeight: displayLineHeight(32, 2) }}>{task.text}</ThemedText>{task.roman && task.roman !== task.text && <ThemedText>{task.roman}</ThemedText>}</>}
      {stage === 'prepare' && <>
        <ThemedText type="smallBold">{t('sentence.prepare', { seconds: Math.ceil(remaining / 1000) })}</ThemedText>
        <ThemedText type="small">{t('sentence.prepareBody', { focus: task.focus })}</ThemedText>
      </>}
    </>}
    {(listening || stage === 'prepare') && <SentenceAction label={heard ? t('sentence.listenAgain') : t('sentence.listen')} onPress={() => void listen()} disabled={busy} />}
    {/* Die ehrliche Quellen-Zeile nur, solange keine Aussage der Wiedergabe
        danebensteht — sonst stand hier zweimal fast dasselbe (Nutzerbefund
        21.09.2026, en-UI). */}
    {!notice && <ThemedText type="small">{t('sentence.exampleNote')}</ThemedText>}
    <ThemedText accessibilityLiveRegion="polite" type="small">{capture.error ? t(MIC_ERROR_KEYS[capture.error.code]) : notice}</ThemedText>
    {!listening && stage === 'prepare' && <>
      {mode === 'shadowing' && <SentenceAction label={headphones ? t('sentence.headphonesOk') : t('sentence.headphones')} onPress={() => setHeadphones(value => !value)} />}
      <ThemedText type="small">{t('sentence.micNote', { action: t('sentence.start'), seconds: windowMs / 1000 })}</ThemedText>
      <SentenceAction label={t('sentence.start')} onPress={() => void start()} disabled={busy || remaining > 0 || !heard || (mode === 'shadowing' && !headphones)} />
      {/* Ohne Mikrofon ging es hier nicht weiter — der Satz lässt sich
          immer überspringen (Testrunde 26.09.). */}
      <SentenceAction label={t('sentence.nextSentence')} onPress={() => reset(index + 1)} />
    </>}
    {!listening && stage === 'record' && <>
      <ThemedText accessibilityLiveRegion="polite">{t('sentence.remaining', { seconds: Math.max(0, Math.ceil((windowMs - capture.elapsedMs) / 1000)) })}</ThemedText>
      <SentenceAction label={t('sentence.stop')} onPress={() => void stop()} disabled={busy} />
    </>}
    {result && <>
      <ThemedText type="smallBold">{t('sentence.measurement', { seconds: (result.durationMs / 1000).toFixed(1) })}</ThemedText>
      <ThemedText type="small">{t('sentence.voicedNote', { percent: result.voicedFramePercent })}{result.reachedLimit ? ` ${t('sentence.limitReached')}` : ''}</ThemedText>
      {result.contour.status === 'measured' ? <><MeasuredToneContour points={result.contour.summary.pts} /><ThemedText type="small">{t('sentence.contourNote', { duration: result.contour.summary.durMs })}</ThemedText></> : <ThemedText type="small">{t('sentence.noVoiced')}</ThemedText>}
      <SentenceAction label={t('sentence.reprepare')} onPress={() => reset(index, round)} />
      <SentenceAction label={mode === 'sentenceRepeat' && round < 2 ? t('sentence.nextWindow') : t('sentence.nextSentence')} onPress={() => mode === 'sentenceRepeat' && round < 2 ? reset(index, round + 1) : reset(index + 1)} />
    </>}
    {listening && <>
      <ThemedText type="smallBold">{t('sentence.questionPrompt')}</ThemedText>
      {/* Die erste Antwort ist IMMER die Lösung — auf der de-Brücke die
          deutsche Bedeutung, auf anderen Brücken der gehörte Zielsatz
          (Erkennungsmodus, 21.09.2026). */}
      {sentenceAnswers(task, seed + index).map(option => <SentenceAction key={option}
        label={language === 'th' && task.answersRoman?.[task.answers.indexOf(option)]
          ? `${option}\n${task.answersRoman[task.answers.indexOf(option)]}` : option}
        disabled={!heard || answer !== null || busy}
        onPress={() => { if (!heard || answer !== null) return; setAnswer(option); if (option === task.answers[0]) setCorrect(value => value + 1); void stopPronunciation(); }} />)}
      {answer !== null && <>
        <ThemedText accessibilityLiveRegion="polite">{answer === task.answers[0] ? t('sentence.correct') : t('sentence.meant', { answer: task.answers[0] })}</ThemedText>
        <ThemedText>{task.text}</ThemedText>
        {task.roman && task.roman !== task.text ? <ThemedText>{task.roman}</ThemedText> : null}
        <ThemedText type="small">{task.focus}</ThemedText>
        <SentenceAction label={t('sentence.nextSentence')} onPress={() => reset(index + 1)} />
      </>}
    </>}
    <ThemedText type="small">{sentenceFootnote(language, uiLanguage)}</ThemedText>
  </ThemedView>;
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two, borderRadius: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  action: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two },
  /** Mindesthöhe eines Tippziels (WCAG 2.5.8), wie bei den Aktionsflächen. */
  toggle: { minHeight: 44, justifyContent: 'center' },
});
