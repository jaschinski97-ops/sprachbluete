import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AudioPlayer } from 'expo-audio';

import { LanguagePalette } from './character-palette';
import { ENTER_PRUEFT } from './sentence-input';
import { ThemedText, displayLineHeight } from './themed-text';
import { ThemedView } from './themed-view';

import { dictationConfigFor } from '@/data/dictation-config';
import type { SatzSprache } from '@/data/sentence-tasks';
import { Spacing } from '@/constants/theme';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import {
  hasPronunciationClip,
  isLanguageAvailable,
  playPronunciationWithStatus,
  stopPronunciation,
} from '@/lib/audio';
import {
  buildDictationSession,
  dictationFootnote,
  type DictationTask,
} from '@/lib/dictation/tasks';
import {
  ratingForScore,
  scoreDictation,
  type DictationDiffToken,
  type DictationScore,
} from '@/lib/dictation/scoring';
import { type Rating } from '@/lib/fsrs/types';
import { anchorOf, type PairDirection } from '@/lib/languages/types';
import { languageOf } from '@/lib/languages/registry';
import { loadOrCreateCardState, rateCard } from '@/lib/repository';
import { recordDrill } from '@/lib/review-log';
import { resolveClipUri } from '@/lib/clips/lookup';
import { useLocale, type TranslationKey } from '@/lib/i18n';
import type { LearningStage } from '@/lib/learning-stages';
import { dictationPromptKey, learningLanguage } from '@/lib/languages/definitions';

import { ratingExplanation } from '@/lib/writing';

/**
 * Diktat — Satz hören, in der Zielsprache tippen, vergleichen (Roadmap v2,
 * Phase 1). Der Forschungsanker ist der Mehrwort-Chunk: Anders als die
 * Vokabelübungen fragt das Diktat den ganzen Satz ab, mit Interpunktion,
 * Satzakzent und — im Thai — Tonzeichen in Position.
 *
 * Ablauf je Aufgabe: Satz abspielen (mehrfach, mit hinterlegtem Clip auch
 * verlangsamt) → tippen → Auswertung mit Wort-für-Wort- bzw.
 * Zeichen-für-Zeichen-Vergleich → Rückmeldung → bei Erfolg fortgeschriebene
 * FSRS-Karte. Alles offline; die Wiedergabe läuft über dieselbe Policy wie
 * die Satzübungen (`purpose: 'sentence'`), also Clip vor Systemstimme, mit
 * ehrlicher Kennzeichnung, was gehört wurde.
 *
 * FSRS-Regel (dokumentiert in `lib/dictation/scoring.ts`): **Nur bestandene
 * Diktate bewerten** — genau richtig als „Gut", bestanden mit Abweichung als
 * „Schwer", nicht bestanden GAR NICHT. Die Rückmeldung sagt das ausdrücklich,
 * sonst bliebe unklar, warum eine scheiternde Aufgabe den Wortplan nicht
 * bewegt. Dieselbe Karte wie Karteikarte und freies Schreiben, kein zweiter
 * Schlüssel (AE-16).
 *
 * Der Runner hängt an `{ language, direction, onExit }` — er zieht sich Stoff,
 * Bewertung und Karte selbst. Die Richtung kommt seit dem 18.09.2026 vom
 * Aufrufer: Das Deutsch-Diktat (th_to_de) schreibt dieselbe Karte fort wie
 * Karteikarte und freies Schreiben dieser Richtung (AE-16), und die Sprache
 * ist die PRODUZIERTE Seite des Paars (`de` im Deutsch-Ziel), nicht mehr die
 * über `targetLanguageOf` abgeleitete Ankerseite.
 */

/** Verlangsamt, aber hörbar — innerhalb der expo-audio-Grenze (Android 0.1–2.0). */
const SLOW_RATE = 0.7;

/** FSRS-Bewertung → i18n-Key (die Labels selbst stehen in den Wörterbüchern). */
const RATING_KEYS: Record<Rating, TranslationKey> = {
  1: 'rating.again',
  2: 'rating.hard',
  3: 'rating.good',
  4: 'rating.easy',
};

export function DictationRunner({
  language,
  direction,
  stage,
  onExit,
}: {
  language: SatzSprache;
  direction: PairDirection;
  /** Sätze nur aus dem Grundwortschatz dieser Stufe. */
  stage?: LearningStage;
  onExit: () => void;
}) {
  const theme = useTheme();
  const toneColor = useToneColor();
  const { t, uiLanguage } = useLocale();
  const label = languageOf(language).label;

  // Die Aussaat würfelt die Runde neu — dieselbe Bauart wie alle anderen
  // Übungen, damit „Neue Runde" nicht dieselbe Folge zeigt. Die Zusammen-
  // stellung ist reine Datenrechnung (kein Store), deshalb synchron abgeleitet.
  const [seed, setSeed] = useState(() => Date.now());
  const session = useMemo(() => buildDictationSession(language, direction, seed, undefined, stage), [language, direction, seed, stage]);

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [score, setScore] = useState<DictationScore | null>(null);
  const [rated, setRated] = useState<Rating | null>(null);
  const [results, setResults] = useState<DictationScore[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [audioNote, setAudioNote] = useState('');

  const slowPlayer = useRef<AudioPlayer | null>(null);
  const releaseSlowPlayer = useCallback(() => {
    const player = slowPlayer.current;
    slowPlayer.current = null;
    if (!player) return;
    try {
      player.remove();
    } catch {
      // Ein bereits freigegebener Player braucht nichts mehr.
    }
  }, []);

  // Beim Verlassen und beim Aufgabenwechsel: nichts spielt nach.
  useEffect(() => {
    return () => {
      releaseSlowPlayer();
      void stopPronunciation();
    };
  }, [releaseSlowPlayer, index]);

  const task = session[index] ?? null;
  const config = task ? dictationConfigFor(task.language) : null;
  const answered = score !== null;

  /** Normale Wiedergabe — dieselbe Policy wie die Satzübungen. */
  const play = useCallback(async (): Promise<boolean> => {
    if (!task) return false;
    const request = { text: task.text, language, purpose: 'sentence' as const };
    if (!await hasPronunciationClip(request) && await isLanguageAvailable(language) === false) {
      setNotice(t('dictation.noVoice', { language: label }));
      return false;
    }
    const playback = await playPronunciationWithStatus(request);
    setAudioNote(playback.kind === 'asset' ? t('sentence.audioClip') : playback.kind === 'tts' ? t('sentence.audioSystem') : t('dictation.noVoice', { language: label }));
    return playback.kind !== 'unavailable';
  }, [task, language, label, t]);

  /**
   * Verlangsamt nur ein hinterlegter Clip — die Systemstimme lässt sich über
   * die Wiedergabe-Policy nicht drosseln, und ein Fallback, der still schnell
   * spielt, würde vortäuschen, es sei langsam. Deshalb: Clip vorhanden →
   * expo-audio-Player mit `shouldCorrectPitch` (die Töne müssen bleiben);
   * sonst ehrlicher Hinweis und normale Geschwindigkeit.
   */
  const playSlow = useCallback(async (): Promise<boolean> => {
    if (!task) return false;
    const uri = await resolveClipUri({ text: task.text, language, purpose: 'sentence' }).catch(() => null);
    if (!uri) {
      setNotice(t('dictation.slowClipOnly'));
      return play();
    }
    releaseSlowPlayer();
    // Natives Modul erst bei Bedarf laden (dasselbe Muster wie `lib/audio`):
    // so bleibt der Player im Jest-Prozess austauschbar und lädt nicht beim
    // reinen Import der Komponente.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
    const player = createAudioPlayer({ uri });
    slowPlayer.current = player;
    try {
      player.shouldCorrectPitch = true;
      player.setPlaybackRate(SLOW_RATE, 'low');
    } catch {
      try {
        player.playbackRate = SLOW_RATE;
      } catch {
        setAudioNote(t('dictation.slowUnsupported'));
      }
    }
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || status.error !== null) releaseSlowPlayer();
    });
    player.play();
    return true;
  }, [task, language, play, releaseSlowPlayer, t]);

  const submit = useCallback(async () => {
    // Leer prüfen wertete als „nicht bestanden“ — wie im Rollenspiel gesperrt.
    if (!task || !config || busy || answered || !draft.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      const next = scoreDictation(draft, task.text, config);
      setScore(next);
      setResults((previous) => [...previous, next]);
      // Die Fehlerquote des Diktats steuert die Gewichtung der Heutigen
      // Runde — protokolliert unabhängig vom Kartenschreiben.
      await recordDrill(next.passed, Date.now(), undefined, 'dictation', direction).catch(() => {});
      if (next.passed) {
        // ratingForScore liefert bei `passed` immer 2 oder 3 — nie null.
        const rating = ratingForScore(next)!;
        const card = await loadOrCreateCardState(task.vocabId, task.direction);
        await rateCard(card, rating);
        setRated(rating);
      } else {
        setRated(null);
      }
    } finally {
      setBusy(false);
    }
  }, [task, config, busy, answered, draft]);

  const next = useCallback(() => {
    setScore(null);
    setRated(null);
    setDraft('');
    setNotice('');
    setAudioNote('');
    releaseSlowPlayer();
    setIndex((current) => current + 1);
  }, [releaseSlowPlayer]);

  if (session.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('dictation.noneFor', { language: label })}</ThemedText>
        <ThemedText type="small">{dictationFootnote(language, uiLanguage)}</ThemedText>
        <ExitButton onExit={onExit} label={t('common.back')} />
      </ThemedView>
    );
  }

  if (!task) {
    const correct = results.filter((entry) => entry.passed).length;
    const exact = results.filter((entry) => entry.exact).length;
    const missed = session.filter((_, position) => !results[position]?.passed);
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.roundDone')}</ThemedText>
        <ThemedText type="small">
          {t('dictation.summary', { correct, total: session.length, exact })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('dictation.onlyPassedRate')}
        </ThemedText>
        {missed.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('drill.mistakesTitle')}
            </ThemedText>
            {missed.map((entry) => (
              <View key={entry.id}>
                <ThemedText type="small">{entry.text}</ThemedText>
                {entry.language === 'th' && entry.roman ? (
                  <ThemedText type="small" themeColor="textSecondary">{entry.roman}</ThemedText>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              releaseSlowPlayer();
              setResults([]);
              setIndex(0);
              setSeed(Date.now());
            }}
            accessibilityRole="button"
            accessibilityLabel={t('dictation.newRoundA11y')}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundSelected" style={styles.wide}>
              <ThemedText type="smallBold">{t('drill.newRound')}</ThemedText>
            </ThemedView>
          </Pressable>
          <ExitButton onExit={onExit} label={t('common.back')} />
        </View>
      </ThemedView>
    );
  }

  return (
    <>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('dictation.progress', { index: index + 1, total: session.length })}
        </ThemedText>
        <ExitButton onExit={onExit} label={t('dictation.exit')} />
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t(dictationPromptKey(task.language))}</ThemedText>

        <View style={styles.row}>
          <Pressable
            onPress={() => void play()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('dictation.play')}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.action, { borderColor: theme.borderSubtle }, pressed && styles.pressed]}>
            <ThemedText type="smallBold">{t('dictation.play')}</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => void playSlow()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('dictation.playSlowA11y')}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.action, { borderColor: theme.borderSubtle }, pressed && styles.pressed]}>
            <ThemedText type="smallBold">{t('dictation.slow')}</ThemedText>
          </Pressable>
        </View>
        {/* Ehrlich kennzeichnen, was gehört wurde: Clip oder Systemstimme. */}
        {audioNote ? (
          <ThemedText type="small" themeColor="textSecondary">
            {audioNote}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {t('dictation.relistenNote', { action: t('dictation.check') })}
        </ThemedText>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          {...ENTER_PRUEFT}
          editable={!answered}
          multiline
          placeholder={learningLanguage(task.language).placeholders.sentence}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          // Rechtschreibhilfe aus: Sie würde genau die Fehler wegkorrigieren,
          // um die es beim Diktat geht.
          spellCheck={false}
          accessibilityLabel={t('dictation.inputA11y')}
          style={[styles.input, { color: theme.text, borderColor: theme.borderSubtle }]}
        />

        {!answered ? (
          <LanguagePalette
            language={task.language}
            onInsert={(character) => setDraft((current) => current + character)}
          />
        ) : null}

        {!answered ? (
          <View style={styles.row}>
            <Pressable
              onPress={() => void submit()}
              disabled={busy || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('dictation.checkA11y')}
              accessibilityState={{ disabled: busy || !draft.trim() }}
              style={({ pressed }) => [pressed && styles.pressed, (busy || !draft.trim()) && styles.disabled]}>
              <ThemedView type="backgroundSelected" style={styles.wide}>
                <ThemedText type="smallBold">{t('dictation.check')}</ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        ) : null}

        {score ? <Feedback score={score} rated={rated} task={task} toneColor={toneColor} themeText={theme.text} /> : null}

        {notice ? (
          <ThemedText accessibilityLiveRegion="polite" type="small">
            {notice}
          </ThemedText>
        ) : null}
      </ThemedView>

      {answered ? (
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={t('common.next')}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundSelected" style={styles.wide}>
            <ThemedText type="smallBold">{t('common.next')}</ThemedText>
          </ThemedView>
        </Pressable>
      ) : null}
    </>
  );
}

/** Diff-Farben: grün (Ton `mid`) = sitzt, rot (Ton `falling`) = prüfen. */
function DiffLine({
  diff,
  toneColor,
  themeText,
}: {
  diff: DictationDiffToken[];
  toneColor: (tone: 'mid' | 'falling' | 'low') => string;
  themeText: string;
}) {
  const farbige = diff.filter((token) => token.status !== 'extra');
  const zuviel = diff.filter((token) => token.status === 'extra').map((token) => token.text.trim()).filter(Boolean);
  const { t } = useLocale();
  return (
    <View>
      {/* Display-Zeilenhöhe wie überall im Thai-Satzbau: sonst schneiden
          Tonzeichen an der Kante ein (UI-Review 2026-09-07). */}
      <Text maxFontSizeMultiplier={2} style={{ color: themeText, fontSize: 24, lineHeight: displayLineHeight(24, 2) }}>
        {farbige.map((token, position) => (
          <Text
            key={position}
            style={{
              color:
                token.status === 'match' ? toneColor('mid') : toneColor('falling'),
            }}>
            {token.text}
          </Text>
        ))}
      </Text>
      {zuviel.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('dictation.tooMuch', { tokens: zuviel.join(' ') })}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Feedback({
  score,
  rated,
  task,
  toneColor,
  themeText,
}: {
  score: DictationScore;
  rated: Rating | null;
  task: DictationTask;
  toneColor: (tone: 'mid' | 'falling' | 'low') => string;
  themeText: string;
}) {
  const { t } = useLocale();
  const border = score.passed ? toneColor('mid') : toneColor('falling');
  const tonAnteil = task.language === 'th' || score.diacriticScore < 100;

  return (
    <ThemedView
      type="backgroundSelected"
      style={[styles.feedback, { borderColor: border, borderWidth: 2 }]}>
      <ThemedText type="smallBold">
        {score.passed ? (score.exact ? t('drill.exact') : t('dictation.passed')) : t('dictation.failed')}
      </ThemedText>

      {score.message ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t(score.message.key, score.message.params)}
        </ThemedText>
      ) : null}

      <ThemedText type="small">
        {t('dictation.baseScore', {
          base: score.baseScore,
          tonePart: tonAnteil ? t('dictation.toneScorePart', { score: score.diacriticScore }) : '',
        })}
      </ThemedText>

      <DiffLine diff={score.diff} toneColor={toneColor} themeText={themeText} />

      {/* Die Bedeutung und die Umschrift erst NACH der Auswertung — vorher
          wäre die Lösung lesbar, und das Diktat würde zum Abschreiben. Die
          deutsche Satzbedeutung steht nur auf der de-Brücke: Andere Anker
          haben keine Satzübersetzung im Bestand (21.09.2026). */}
      <ThemedText type="small">{task.text}</ThemedText>
      {anchorOf(task.direction) === 'de' && (
        <ThemedText type="small" themeColor="textSecondary">
          {task.german}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {task.roman}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {task.focus}
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary">
        {rated
          ? t('rating.ratedAs', { rating: t(RATING_KEYS[rated]), explanation: t(ratingExplanation(rated)) })
          : t('dictation.notRated')}
      </ThemedText>
    </ThemedView>
  );
}

function ExitButton({ onExit, label }: { onExit: () => void; label: string }) {
  return (
    <Pressable
      onPress={onExit}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Mindestgroesse eines Tippziels, wie in Phase 9 festgelegt. */
  tapTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 20,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  wide: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  feedback: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
