import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LanguagePalette } from './character-palette';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, Spacing } from '@/constants/theme';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { useLocale, type TranslationKey } from '@/lib/i18n';
import { writingPromptKey } from '@/lib/languages/definitions';
import type { VocabEntry } from '@/data/vocab-types';

import { type Rating } from '@/lib/fsrs/types';
import type { PairDirection } from '@/lib/languages/types';
import type { LearningStage } from '@/lib/learning-stages';
import {
  buildWritingSession,
  ratingExplanation,
  submitWriting,
  summarizeWriting,
  WritingResult,
  WritingSession,
} from '@/lib/writing';

/**
 * Freies Schreiben — die einzige Übung, die den Kartenzustand fortschreibt.
 *
 * Ablauf je Aufgabe: Vorgabe lesen, Antwort tippen, absenden, Rückmeldung
 * lesen, weiter. Die Rückmeldung nennt bei einem Fehler ausdrücklich **was**
 * falsch war (Großschreibung, Umlaut, Artikel, Tonzeichen) und sagt, was die
 * Bewertung mit der Wiederholung macht — sonst wäre für Lernende nicht
 * erkennbar, warum eine Vokabel wiederkommt.
 *
 * Die Eingabehilfe hängt an der Antwortsprache: Thai bekommt die
 * Zeichenpalette (AE-39), Deutsch die Umlaute, Spanisch die Akzentzeichen.
 * Englisch bekommt keine — dort steht jedes Zeichen der Zielform ohnehin auf
 * jeder lateinischen Tastatur.
 */

/** FSRS-Bewertung → i18n-Key (die Labels selbst stehen in den Wörterbüchern). */
const RATING_KEYS: Record<Rating, TranslationKey> = {
  1: 'rating.again',
  2: 'rating.hard',
  3: 'rating.good',
  4: 'rating.easy',
};

/**
 * Schreibübung für eine Richtung: Aufgaben aus `buildWritingSession`, wahlweise aus einer festen Wortliste
 * (`entries`, z. B. Kapitel) oder aus der gewählten `stage`; `size` begrenzt die Rundenlänge. Jede Antwort
 * geht über `submitWriting` in die Karte (FSRS) — außer wenn die Lösung zuvor eingeblendet wurde (`assisted`).
 */
export function WritingRunner({
  direction,
  entries,
  size,
  stage,
  onExit,
}: {
  direction: PairDirection;
  entries?: VocabEntry[];
  size?: number;
  /** Ohne eigene Wortliste: Wörter nur aus dieser Stufe. */
  stage?: LearningStage;
  onExit: () => void;
}) {
  const theme = useTheme();
  const toneColor = useToneColor();
  const { t, languageName } = useLocale();

  const [session, setSession] = useState<WritingSession | null>(null);
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  // `result`: Ergebnis der aktuellen Aufgabe (nicht null = beantwortet); `results`: alle der Runde für die Auswertung.
  const [result, setResult] = useState<WritingResult | null>(null);
  const [results, setResults] = useState<WritingResult[]>([]);
  const [busy, setBusy] = useState(false);
  // `assisted`: Lösung wurde zum Abschreiben eingeblendet; `assistedCount` zählt solche Aufgaben der Runde.
  const [assisted, setAssisted] = useState(false);
  const [assistedCount, setAssistedCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Neue Runde (auch bei „Neue Runde“ über `round`): alles zurücksetzen und die Aufgaben neu zusammenstellen.
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setIndex(0);
    setDraft('');
    setResult(null);
    setResults([]);
    setAssisted(false); setAssistedCount(0); setPaletteOpen(false);
    buildWritingSession({ direction, entries, size, stage }).then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [direction, entries, size, stage, round]);

  const prompt = session?.prompts[index] ?? null;

  // Antwort abgeben: `submitWriting` bewertet und schreibt die Karte fort (FSRS). Mit `assisted` (Lösung vorher
  // gesehen) bleibt die Karte unberührt. `busy` und `result` verhindern doppeltes Absenden.
  const submit = useCallback(async () => {
    if (!prompt || busy || result) return;
    setBusy(true);
    try {
      const next = await submitWriting(prompt, draft, { assisted });
      if (assisted) setAssistedCount(value => value + 1);
      setResult(next);
      setResults((previous) => [...previous, next]);
    } finally {
      setBusy(false);
    }
  }, [prompt, draft, busy, result, assisted]);

  const next = useCallback(() => {
    setResult(null);
    setDraft('');
    setAssisted(false); setPaletteOpen(false);
    setIndex((current) => current + 1);
  }, []);

  if (!session) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('writing.assembling')}
        </ThemedText>
      </ThemedView>
    );
  }

  if (session.prompts.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">
          {t('writing.noneForDirection')}
        </ThemedText>
        <ExitButton onExit={onExit} label={t('drill.exit')} />
      </ThemedView>
    );
  }

  // Hinter der letzten Aufgabe: Zusammenfassung. War jede Antwort abgeschrieben, zählte nichts als Wiederholung.
  if (index >= session.prompts.length) {
    const score = summarizeWriting(results);
    const missed = results.filter((entry) => !entry.verdict.correct);
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.roundDone')}</ThemedText>
        <ThemedText type="small">
          {t('writing.summary', { correct: score.correct, total: score.total, exact: score.exact })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t(assistedCount === results.length ? 'learning.noReviews' : 'writing.countsAsReview')}
        </ThemedText>
        {missed.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('drill.mistakesTitle')}
            </ThemedText>
            {missed.map((entry) => (
              <ThemedText key={entry.prompt.id} type="small">
                {entry.prompt.solution}
              </ThemedText>
            ))}
          </>
        ) : null}
        <View style={styles.row}>
          <Pressable
            onPress={() => setRound((current) => current + 1)}
            accessibilityRole="button"
            accessibilityLabel={t('drill.newRound')}
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

  if (!prompt) return null;

  // Nach der Auswertung sind Eingabe und Hilfen gesperrt; die Rückmeldung steht unter der Aufgabe.
  const answered = result !== null;

  return (
    <>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('writing.taskOf', { index: index + 1, total: session.prompts.length })}
        </ThemedText>
        <ExitButton onExit={onExit} label={t('drill.exit')} />
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {/* „Mit Akzentzeichen“ nur, wenn die Lösung wirklich eines hat
              (vorher auch bei „o“ — Testrunde 25.10.). */}
          {t(prompt.language === 'es' && !/[áéíóúüñ¿¡]/i.test(prompt.solution) ? 'writing.promptGeneric' : writingPromptKey(prompt.language), { language: languageName(prompt.language) })}
        </ThemedText>

        <View style={styles.promptBlock}>
          <ThemedText style={styles.promptText}>{prompt.shown}</ThemedText>
          {prompt.shownHint ? (
            <ThemedText type="small" themeColor="textSecondary">
              {prompt.shownHint}
            </ThemedText>
          ) : null}
        </View>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          editable={!answered}
          placeholder={t('writing.inputA11y')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          // Rechtschreibhilfe aus: Sie wuerde genau die Fehler wegkorrigieren,
          // um die es hier geht.
          spellCheck={false}
          accessibilityLabel={t('writing.inputA11y')}
          style={[styles.input, { color: theme.text, borderColor: Colors.dark.backgroundSelected }]}
        />

        {/* Eine Zeichenhilfe nur, wo die Tastatur wirklich nicht reicht:
            Thai braucht eine ganze Belegung, Deutsch die Umlaute, Spanisch die
            Akzentzeichen. Englisch braucht keine — dort steht jedes Zeichen
            der Zielform auf jeder lateinischen Tastatur. */}
        {!answered ? <>
          <Pressable accessibilityRole="button" onPress={() => setAssisted(true)} style={styles.wide}>
            <ThemedText type="small">{t('learning.copy')}</ThemedText>
          </Pressable>
          {assisted ? <>
            <ThemedText type="subtitle">{prompt.solution}</ThemedText>
            {prompt.language === 'th' ? <View style={styles.row}>
              {[...new Set(Array.from(prompt.targets[0] ?? ''))].filter(character => character.trim()).map(character => (
                <Pressable key={character} accessibilityRole="button" accessibilityLabel={`${t('writing.inputA11y')}: ${character}`}
                  onPress={() => setDraft(value => value + character)} style={styles.copyKey}>
                  <ThemedText>{/\p{M}/u.test(character) ? `◌${character}` : character}</ThemedText>
                </Pressable>
              ))}
            </View> : null}
          </> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: paletteOpen }} onPress={() => setPaletteOpen(value => !value)} style={styles.wide}>
            {/* Vorher stand hier „Antwort eingeben · +“ — klang wie das Feld, öffnet aber die Zeichentafel. */}
            <ThemedText type="small">{t('writing.paletteToggle')} · {paletteOpen ? '−' : '+'}</ThemedText>
          </Pressable>
        </> : null}
        {!answered && paletteOpen ? <LanguagePalette
            language={prompt.language}
            onInsert={(character) => setDraft((current) => current + character)}
          /> : null}

        {!answered ? (
          <View style={styles.row}>
            <Pressable
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('writing.checkA11y')}
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [pressed && styles.pressed, busy && styles.disabled]}>
              <ThemedView type="backgroundSelected" style={styles.wide}>
                <ThemedText type="smallBold">{t('writing.check')}</ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        ) : null}

        {result ? <Feedback result={result} toneColor={toneColor} /> : null}
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

/**
 * Rückmeldung zu einer beantworteten Aufgabe: genau/richtig/falsch, Fehlerhinweis (z. B. Artikel, Tonzeichen),
 * Musterlösung samt Zusatzinfos und eine Zeile, was die Bewertung mit der Wiederholung macht.
 */
function Feedback({
  result,
  toneColor,
}: {
  result: WritingResult;
  toneColor: (tone: 'mid' | 'falling' | 'low') => string;
}) {
  const { t } = useLocale();
  const { verdict, rating, prompt } = result;
  // Rahmenfarbe aus der Tonfarbpalette: richtig = „mid“, falsch = „falling“.
  const border = verdict.correct ? toneColor('mid') : toneColor('falling');

  return (
    <ThemedView
      type="backgroundSelected"
      style={[styles.feedback, { borderColor: border, borderWidth: 2 }]}>
      <ThemedText type="smallBold">
        {verdict.exact ? t('drill.exact') : verdict.correct ? t('drill.correct') : t('drill.wrong')}
      </ThemedText>

      {verdict.message ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t(verdict.message.key, verdict.message.params)}
          {verdict.article ? ` ${t('writing.correctArticle', { article: verdict.article })}` : ''}
        </ThemedText>
      ) : null}

      <ThemedText type="small">{prompt.solution}</ThemedText>
      {prompt.extras.map((extra) => (
        <ThemedText key={extra} type="small" themeColor="textSecondary">
          {extra.startsWith('Plural: ') ? t('flashcard.plural', { plural: extra.slice(8) }) : extra}
        </ThemedText>
      ))}

      {/* Sichtbar machen, was die Antwort mit der Wiederholung macht - sonst
          bliebe unerklaerlich, warum eine Vokabel frueher wiederkommt. */}
      <ThemedText type="small" themeColor="textSecondary">
        {result.assisted ? t('learning.noReviews') : t('rating.ratedAs', { rating: t(RATING_KEYS[rating]), explanation: t(ratingExplanation(rating)) })}
      </ThemedText>
    </ThemedView>
  );
}

/** Schlichter Textknopf (mindestens 44 px hoch) zum Verlassen der Übung. */
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
  copyKey: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  promptBlock: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  promptText: {
    fontSize: 30,
    lineHeight: 44,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 20,
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
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
