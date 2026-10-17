import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  hasPronunciationClip,
  isLanguageAvailable,
  playPronunciationWithStatus,
  stopPronunciation,
} from '@/lib/audio';
import { ThemedButton } from './themed-button';
import { ThemedText, displayLineHeight } from './themed-text';
import { ThemedView } from './themed-view';
import { TranslationKey, useLocale } from '@/lib/i18n';
import { targetLanguageOf, type PairDirection } from '@/lib/languages/types';
import {
  buildWordSpeakingSession,
  type WordSpeakingTask,
} from '@/lib/speaking/word-session';

/**
 * Wort-Nachsprechen für Englisch und Spanisch (Lern-Reiter-Ausbau 13.09.).
 *
 * Der Ablauf je Wort: Musterlösung anhören (Clip vor Systemstimme, wie
 * überall) → laut nachsprechen → weiter. Es gibt bewusst KEINE Bewertung:
 * Eine Aussprachemessung wie bei Thai (AE-48) existiert für diese Sprachen
 * nicht, und der Hinweis „nicht bewertet" steht deshalb von Anfang an da —
 * dieselbe Ehrlichkeit wie in den Satzübungen.
 *
 * Der Runner hängt nur an `{ direction, onExit }` — Stoff und Runde zieht er
 * sich selbst (`lib/speaking/word-session`), wie Diktat- und Satz-Runner.
 */
export function WordSpeakingRunner({
  direction,
  onExit,
}: {
  direction: PairDirection;
  onExit: () => void;
}) {
  const { t, languageName } = useLocale();
  const colors = useTheme();
  const language = targetLanguageOf(direction);

  const [tasks, setTasks] = useState<WordSpeakingTask[] | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const generation = useRef(0);

  const restart = useCallback(() => {
    const turn = ++generation.current;
    setTasks(null);
    setEmpty(false);
    setLoadError(null);
    setIndex(0);
    buildWordSpeakingSession({ direction })
      .then((session) => {
        if (generation.current !== turn) return;
        if (session.tasks.length === 0) setEmpty(true);
        else setTasks(session.tasks);
      })
      .catch((e) => {
        if (generation.current !== turn) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, [direction]);

  useEffect(() => {
    restart();
    return () => {
      generation.current += 1;
      void stopPronunciation();
    };
  }, [restart]);

  // Die Musterlösung spielt beim Erscheinen des Worts automatisch — wie in
  // den Auswahlübungen. Wer sie noch einmal hören will, nutzt den Knopf.
  useEffect(() => {
    const task = tasks?.[index];
    if (!task) return;
    const turn = generation.current;
    void (async () => {
      try {
        const request = { text: task.term, language, purpose: 'vocabulary' as const };
        if (!await hasPronunciationClip(request) && await isLanguageAvailable(language) === false) {
          if (generation.current === turn) setNotice('speaking.noticeNone');
          return;
        }
        const playback = await playPronunciationWithStatus(request);
        if (generation.current !== turn) return;
        setNotice(playback.kind === 'unavailable' ? 'speaking.noticeNone' : null);
      } catch {
        if (generation.current === turn) setNotice('speaking.noticeError');
      }
    })();
  }, [tasks, index, language]);

  if (loadError) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('speaking.loadFailedTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('cards.assembleFailed', { message: loadError })}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.retry')} onPress={restart} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  if (!tasks) {
    return empty ? (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('wordSpeaking.noneFor')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordSpeaking.note')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    ) : (
      <ThemedText type="small" themeColor="textSecondary">
        {t('speaking.assembling')}
      </ThemedText>
    );
  }

  const task = tasks[index];

  if (!task) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {t('wordSpeaking.summary', { count: tasks.length })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordSpeaking.noScore')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton label={t('drill.newRound')} onPress={restart} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  return (
    <>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordSpeaking.progress', { index: index + 1, total: tasks.length })}
        </ThemedText>
        <Pressable
          onPress={() => {
            generation.current += 1;
            void stopPronunciation();
            onExit();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('speaking.exitA11y')}
          style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('drill.exit')}
          </ThemedText>
        </Pressable>
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordSpeaking.prompt', { language: languageName(language) })}
        </ThemedText>
        {/* Das Wort in Displaygröße — derselbe Skalierungsdeckel wie in den
            Satzübungen, damit lange Wörter nicht aus dem Screen laufen. */}
        <ThemedText type="subtitle" maxFontSizeMultiplier={2} style={{ lineHeight: displayLineHeight(32, 2) }}>
          {task.term}
        </ThemedText>
        {/* Lateinische Wörter ohne eigene Umschrift („dar“) nicht doppelt. */}
        {task.roman && task.roman !== task.term ? (
          <ThemedText type="small" themeColor="textSecondary">
            {task.roman}
          </ThemedText>
        ) : null}
        <ThemedText type="small">{task.meaning}</ThemedText>

        {notice ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t(notice)}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drill.playAgainA11y')}
            onPress={() => {
              void (async () => {
                try {
                  await playPronunciationWithStatus({
                    text: task.term,
                    language,
                    purpose: 'vocabulary',
                  });
                } catch {
                  setNotice('speaking.noticeError');
                }
              })();
            }}
            style={({ pressed }) => [styles.tapTarget, pressed && styles.pressed]}>
            <ThemedText type="small" style={{ color: colors.accent }}>
              {t('drill.playAgain')}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        {t('wordSpeaking.note')}
      </ThemedText>

      <ThemedButton
        label={t('speaking.nextWord')}
        onPress={() => setIndex((value) => value + 1)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
