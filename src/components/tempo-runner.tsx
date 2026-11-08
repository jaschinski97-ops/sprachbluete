import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { activeVocabularyFor } from '@/data/active-vocabulary';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import { loadCardStatesForDirection } from '@/lib/repository';
import {
  loadTempoBest,
  saveTempoBest,
  TEMPO_MIN_WORDS,
  TEMPO_SECONDS,
  tempoItems,
  tempoWords,
  type TempoItem,
  type TempoWord,
} from '@/lib/tempo-round';

/** So lange bleibt eine falsche Antwort mit der richtigen sichtbar. */
const WRONG_PAUSE_MS = 900;
const RIGHT_PAUSE_MS = 150;

/**
 * Die Tempo-Runde (08.11.2026, `lib/tempo-round.ts`): eine Minute, nur
 * sichere Wörter, je zwei Bedeutungen. Gezählt wird, wie viele man richtig
 * schafft; der eigene Bestwert steht daneben. Keine Karten, kein FSRS.
 */
export function TempoRunner({
  direction,
  passedChapterWords,
  onExit,
}: {
  direction: PairDirection;
  /** Wörter aus bestandenen Kapiteln — sie gelten als sicher. */
  passedChapterWords: ReadonlySet<string>;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const [words, setWords] = useState<TempoWord[] | null>(null);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro');
  const [seed, setSeed] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<TempoItem[]>([]);
  const [left, setLeft] = useState(TEMPO_SECONDS);
  const [newBest, setNewBest] = useState(false);
  const endsAt = useRef(0);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCardStatesForDirection(direction), loadTempoBest(direction)])
      .then(([cards, stored]) => {
        if (cancelled) return;
        setWords(tempoWords(activeVocabularyFor(targetLanguageOf(direction)), cards, passedChapterWords, direction));
        setBest(stored);
      })
      .catch(() => { if (!cancelled) setWords([]); });
    return () => { cancelled = true; };
  }, [direction, passedChapterWords]);

  const items = useMemo(() => (words ? tempoItems(words, direction, seed) : []), [words, direction, seed]);
  const item = items[index];

  // Die Uhr läuft über die Endzeit, nicht über gezählte Takte: ein verspäteter
  // Takt verlängert die Runde nicht.
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
      const rest = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) setPhase('done');
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done') return;
    if (pause.current) clearTimeout(pause.current);
    let cancelled = false;
    void saveTempoBest(direction, correct)
      .then((stored) => {
        if (cancelled) return;
        setNewBest(correct > 0 && stored === correct && correct > best);
        setBest(stored);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Nur beim Ende der Runde speichern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { if (pause.current) clearTimeout(pause.current); }, []);

  const start = () => {
    setSeed((value) => value + 1);
    setIndex(0);
    setChosen(null);
    setCorrect(0);
    setMissed([]);
    setNewBest(false);
    setLeft(TEMPO_SECONDS);
    endsAt.current = Date.now() + TEMPO_SECONDS * 1000;
    setPhase('running');
  };

  const choose = (optionIndex: number) => {
    if (!item || chosen !== null || phase !== 'running') return;
    const right = optionIndex === item.correctIndex;
    setChosen(optionIndex);
    if (right) setCorrect((value) => value + 1);
    else setMissed((previous) => (previous.some((entry) => entry.vocabId === item.vocabId) ? previous : [...previous, item]));
    pause.current = setTimeout(() => {
      setChosen(null);
      setIndex((value) => value + 1);
    }, right ? RIGHT_PAUSE_MS : WRONG_PAUSE_MS);
  };

  if (words === null) {
    return <ThemedText type="small" themeColor="textSecondary">{t('round.assembling')}</ThemedText>;
  }

  if (words.length < TEMPO_MIN_WORDS) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('mode.tempo')}</ThemedText>
        <ThemedText type="small">{t('tempo.tooFew', { count: TEMPO_MIN_WORDS, have: words.length })}</ThemedText>
        <ThemedButton label={t('common.back')} onPress={onExit} />
      </ThemedView>
    );
  }

  if (phase === 'intro') {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('mode.tempo')}</ThemedText>
        <ThemedText type="small">{t('tempo.intro', { seconds: TEMPO_SECONDS, count: words.length })}</ThemedText>
        {best > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('tempo.best', { best })}</ThemedText> : null}
        <ThemedButton label={t('tempo.start')} onPress={start} variant="primary" />
      </ThemedView>
    );
  }

  if (phase === 'done') {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.resultHead}>
          <Ionicons name={newBest ? 'trophy' : 'speedometer'} size={28} color={newBest ? theme.success : theme.accent} />
          <ThemedText type="smallBold">{t('tempo.result', { correct, seconds: TEMPO_SECONDS })}</ThemedText>
        </View>
        <ThemedText type="small" themeColor={newBest ? 'success' : 'textSecondary'}>
          {newBest ? t('tempo.newBest') : t('tempo.best', { best })}
        </ThemedText>
        {missed.length > 0 ? (
          <View style={styles.list}>
            <ThemedText type="small" themeColor="textSecondary">{t('drill.mistakesTitle')}</ThemedText>
            {missed.map((entry) => (
              <ThemedText key={entry.vocabId} type="small">
                {entry.prompt} — {entry.options[entry.correctIndex]}
              </ThemedText>
            ))}
          </View>
        ) : null}
        <View style={styles.row}>
          <ThemedButton label={t('tempo.again')} onPress={start} variant="primary" />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  if (!item) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.status}>
        <ThemedText type="smallBold" themeColor={left <= 10 ? 'error' : 'accent'}>
          {t('tempo.timeLeft', { seconds: left })}
        </ThemedText>
        <ThemedText type="smallBold">{t('tempo.score', { correct })}</ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${(left / TEMPO_SECONDS) * 100}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.prompt}>
        <ThemedText type="subtitle" style={styles.center}>{item.prompt}</ThemedText>
        {item.roman ? <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{item.roman}</ThemedText> : null}
      </View>
      <View style={styles.options}>
        {item.options.map((option, optionIndex) => {
          const answered = chosen !== null;
          const border = answered && optionIndex === item.correctIndex
            ? theme.success
            : answered && optionIndex === chosen ? theme.error : undefined;
          return (
            <Pressable
              key={`${item.id}:${optionIndex}`}
              onPress={() => choose(optionIndex)}
              disabled={answered}
              accessibilityRole="button"
              accessibilityLabel={option}
              style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
              <ThemedView type="background" style={[styles.option, border ? { borderColor: border } : null]}>
                <ThemedText type="smallBold" style={styles.center}>{option}</ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  status: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  prompt: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  options: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  optionWrap: {
    flex: 1,
  },
  option: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  list: {
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
