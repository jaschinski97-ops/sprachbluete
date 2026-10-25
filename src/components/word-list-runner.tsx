import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { LanguagePalette } from './character-palette';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme, useToneColor } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n';
import { learningLanguage } from '@/lib/languages/definitions';
import { type PairDirection, targetLanguageOf } from '@/lib/languages/types';
import type { LearningStage } from '@/lib/learning-stages';
import {
  buildWordList,
  checkWordListAnswer,
  saveWordListAnswers,
  type WordList,
  type WordListAnswer,
  type WordListMode,
} from '@/lib/word-list';

// Ablauf einer Liste: ansehen (study) → verdeckte Seite eintragen (quiz) → ausgewertet (checked).
type Phase = 'study' | 'quiz' | 'checked';

/**
 * Wortliste (24.10.2026): 20 Wörter links, Bedeutungen rechts. „Start“
 * verdeckt eine Seite, man trägt sie ein, „Alle prüfen“ wertet aus, danach
 * kommen die nächsten 20. Logik und Bewertung: `lib/word-list.ts`.
 *
 * Gespeichert wird erst beim Weitergehen (oder Verlassen), damit „Zählt doch“
 * eine Antwort noch umwerten kann, bevor sie in die Karte geht.
 */
type Pending = { current: { answers: WordListAnswer[]; mode: WordListMode } | null };

/** Noch nicht gespeicherte Auswertung in die Karten schreiben (einmal). */
async function flushPending(pending: Pending): Promise<void> {
  const open = pending.current;
  pending.current = null;
  if (open && open.answers.length > 0) await saveWordListAnswers(open.answers, open.mode).catch(() => {});
}

/**
 * Äußere Hülle der Wortliste: hält Richtung, Modus (Bedeutung oder Wort eintragen) und die Rundennummer.
 * Jede neue Liste ist eine neu eingehängte `WordListRound` (Schlüssel enthält die Runde), der Modus bleibt erhalten.
 * `stage` begrenzt die Wörter auf die gewählte Stufe; `onExit` führt zurück.
 */
export function WordListRunner({
  direction,
  stage,
  onExit,
}: {
  direction: PairDirection;
  stage?: LearningStage;
  onExit: () => void;
}) {
  // Jede Liste ist eine eigene Runde (neu eingehängt); die Richtung bleibt.
  const [round, setRound] = useState(0);
  const [mode, setMode] = useState<WordListMode>('meaning');
  return (
    <WordListRound
      key={`${direction}:${stage ?? ''}:${round}`}
      direction={direction}
      stage={stage}
      mode={mode}
      onMode={setMode}
      onNext={() => setRound((current) => current + 1)}
      onExit={onExit}
    />
  );
}

/** Eine einzelne Liste mit 20 Wörtern samt Phasenwechsel, Eingabefeldern und Auswertung. */
function WordListRound({
  direction,
  stage,
  mode,
  onMode,
  onNext,
  onExit,
}: {
  direction: PairDirection;
  stage?: LearningStage;
  mode: WordListMode;
  onMode: (mode: WordListMode) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const theme = useTheme();
  const toneColor = useToneColor();
  const { t, languageName } = useLocale();
  const language = targetLanguageOf(direction);
  const setMode = onMode;

  // `list` bleibt `null`, bis `buildWordList` die Wörter gewählt hat (Auswahl nach Lernstand, siehe `lib/word-list`).
  const [list, setList] = useState<WordList | null>(null);
  const [phase, setPhase] = useState<Phase>('study');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [answers, setAnswers] = useState<WordListAnswer[]>([]);
  // Zuletzt fokussiertes Feld: Das Sonderzeichen aus der Palette wird dort angehängt.
  const [focused, setFocused] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Eingabefelder nach Zeilenindex, damit „Weiter“ auf der Tastatur das nächste Feld fokussieren kann.
  const inputs = useRef<(TextInput | null)[]>([]);
  // Noch nicht gespeicherte Auswertung — beim Verlassen nachholen.
  const pending = useRef<Pending['current']>(null);

  // Beim Verlassen (Unmount) eine noch offene Auswertung nachträglich speichern; `flushPending` liest den Ref
  // erst im Cleanup und bekommt so den letzten Stand.
  useEffect(() => {
    const box = pending;
    return () => {
      void flushPending(box);
    };
  }, []);

  // Liste laden und leere Entwürfe anlegen; `cancelled` verwirft eine veraltete Antwort bei Richtungswechsel.
  useEffect(() => {
    let cancelled = false;
    void buildWordList({ direction, stage }).then((next) => {
      if (cancelled) return;
      setList(next);
      setDrafts(next.items.map(() => ''));
    });
    return () => {
      cancelled = true;
    };
  }, [direction, stage]);

  // Erst nach dem Umschalten gibt es die Felder: dann ins erste springen.
  useEffect(() => {
    if (phase === 'quiz') inputs.current[0]?.focus();
  }, [phase]);

  // „Alle prüfen“: wertet jede Zeile aus. Gespeichert wird bewusst noch nicht (siehe `pending`), damit
  // „Zählt doch“ ein Synonym noch umwerten kann, bevor es als FSRS-Bewertung in die Karte geht
  // (Bedeutung: höchstens „Schwer“; Wort eintragen: wie die Schreibübung).
  const check = () => {
    if (!list) return;
    const checked = list.items.map((item, index) => checkWordListAnswer(item, mode, drafts[index] ?? ''));
    setAnswers(checked);
    pending.current = { answers: checked, mode };
    setPhase('checked');
    setPaletteOpen(false);
  };

  // Eigene Antwort von Hand als richtig zählen („Zählt doch“); gespeichert wird sie als „Schwer“ (`ratingForAnswer`).
  const accept = (index: number) => {
    const next = answers.map((answer, position) => (position === index ? { ...answer, accepted: true } : answer));
    pending.current = { answers: next, mode };
    setAnswers(next);
  };

  // Erst speichern (`rateCard` je Wort plus Übungsgedächtnis), dann die nächste Liste öffnen.
  const nextRound = async () => {
    await flushPending(pending);
    onNext();
  };

  const leave = async () => {
    await flushPending(pending);
    onExit();
  };

  if (!list) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">{t('writing.assembling')}</ThemedText>
      </ThemedView>
    );
  }

  if (list.items.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">{t('writing.noneForDirection')}</ThemedText>
        <ThemedButton label={t('common.back')} onPress={onExit} />
      </ThemedView>
    );
  }

  // `meaning`: Die Bedeutung ist verdeckt und wird eingetragen; `word`: das Lernwort ist verdeckt (Schreiben).
  const hidesMeaning = mode === 'meaning';
  const correctCount = answers.filter((answer) => answer.correct || answer.accepted).length;
  const filled = drafts.filter((draft) => draft.trim()).length;
  // Sonderzeichen-Palette nur beim Eintragen des Lernworts und nur für Sprachen, die eine haben.
  const hasPalette = !hidesMeaning && learningLanguage(language).palette !== null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {phase === 'study' ? (
        <>
          <View style={styles.toggle} accessibilityRole="radiogroup">
            {(['meaning', 'word'] as const).map((option) => (
              <ThemedButton
                key={option}
                label={t(option === 'meaning' ? 'wordList.modeMeaning' : 'wordList.modeWord')}
                variant={mode === option ? 'primary' : 'secondary'}
                accessibilityState={{ selected: mode === option }}
                onPress={() => setMode(option)}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t(hidesMeaning ? 'wordList.hintMeaning' : 'wordList.hintWord')}
          </ThemedText>
        </>
      ) : phase === 'quiz' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('wordList.filled', { filled, total: list.items.length })}
        </ThemedText>
      ) : (
        <>
          <ThemedText type="smallBold">{t('wordList.summary', { correct: correctCount, total: list.items.length })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('wordList.tracking')}</ThemedText>
        </>
      )}

      <View style={styles.headRow}>
        <ThemedText type="smallBold" style={styles.cell}>{languageName(language)}</ThemedText>
        <ThemedText type="smallBold" style={styles.cell}>{t('wordList.meaningColumn')}</ThemedText>
      </View>

      {list.items.map((item, index) => {
        // Vor der Auswertung gibt es noch keine `answer`; danach zählen richtige und von Hand akzeptierte Antworten.
        const answer = answers[index];
        const ok = answer ? answer.correct || answer.accepted : false;
        const wordCell = (
          <View style={styles.cell}>
            <ThemedText style={language === 'th' ? styles.thaiWord : styles.word}>{item.word}</ThemedText>
            {item.roman ? <ThemedText type="small" themeColor="textSecondary">{item.roman}</ThemedText> : null}
          </View>
        );
        const meaningCell = <ThemedText style={[styles.cell, styles.meaning]}>{item.meaning}</ThemedText>;
        const input = (
          <TextInput
            ref={(element) => { inputs.current[index] = element; }}
            value={drafts[index] ?? ''}
            onChangeText={(text) => setDrafts((current) => current.map((draft, position) => (position === index ? text : draft)))}
            onFocus={() => setFocused(index)}
            onSubmitEditing={() => inputs.current[index + 1]?.focus()}
            returnKeyType={index + 1 < list.items.length ? 'next' : 'done'}
            blurOnSubmit={index + 1 >= list.items.length}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={t('wordList.inputA11y', { index: index + 1 })}
            style={[styles.cell, styles.input, !hidesMeaning && language === 'th' && styles.thaiInput, { color: theme.text, borderColor: theme.cardBorder }]}
          />
        );
        // Je Phase: study zeigt beide Seiten, quiz ersetzt die verdeckte Seite durch ein Eingabefeld, checked durch
        // die gegebene Antwort. Rahmenfarbe erst nach der Auswertung (Tonfarben „mid“/„falling“ = richtig/falsch).
        return (
          <View
            key={item.vocabId}
            style={[
              styles.row,
              { borderColor: phase === 'checked' ? (ok ? toneColor('mid') : toneColor('falling')) : theme.cardBorder },
            ]}>
            <View style={styles.pair}>
              {hidesMeaning ? wordCell : phase === 'study' ? wordCell : phase === 'quiz' ? input : <Given answer={answer} />}
              {!hidesMeaning ? meaningCell : phase === 'study' ? meaningCell : phase === 'quiz' ? input : <Given answer={answer} />}
            </View>
            {phase === 'checked' && answer ? (
              <View style={styles.solution}>
                <ThemedText type="small">
                  {ok ? '✓ ' : '✗ '}
                  {hidesMeaning ? item.meaning : item.writing.solution}
                </ThemedText>
                {/* Nur bei einer eigenen Antwort: ein Synonym, das die Liste nicht kennt. */}
                {!ok && hidesMeaning && answer.given.trim() ? (
                  <ThemedButton label={t('wordList.accept')} onPress={() => accept(index)} />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {phase === 'quiz' && hasPalette ? (
        <>
          <ThemedButton
            label={`${t('writing.paletteToggle')} · ${paletteOpen ? '−' : '+'}`}
            accessibilityState={{ expanded: paletteOpen }}
            onPress={() => setPaletteOpen((value) => !value)}
          />
          {paletteOpen ? (
            <LanguagePalette
              language={language}
              onInsert={(character) =>
                setDrafts((current) => current.map((draft, position) => (position === focused ? draft + character : draft)))
              }
            />
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        {phase === 'study' ? (
          <ThemedButton label={t('wordList.start')} variant="primary" onPress={() => setPhase('quiz')} />
        ) : phase === 'quiz' ? (
          <ThemedButton label={t('wordList.check')} variant="primary" onPress={check} />
        ) : (
          <ThemedButton label={t('wordList.next')} variant="primary" onPress={() => void nextRound()} />
        )}
        <ThemedButton label={t('common.back')} onPress={() => void leave()} />
      </View>
    </ThemedView>
  );
}

/** Die eigene Antwort nach der Prüfung: falsche durchgestrichen und gedämpft, leere als „—“. */
function Given({ answer }: { answer: WordListAnswer | undefined }) {
  const ok = answer ? answer.correct || answer.accepted : false;
  return (
    <ThemedText style={[styles.cell, styles.meaning, !ok && styles.wrong]} themeColor={ok ? undefined : 'textSecondary'}>
      {answer?.given.trim() ? answer.given : '—'}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  toggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  row: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  word: {
    fontSize: 20,
    lineHeight: 28,
  },
  thaiWord: {
    fontSize: 24,
    lineHeight: 38,
  },
  meaning: {
    fontSize: 16,
    lineHeight: 24,
  },
  wrong: {
    textDecorationLine: 'line-through',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
    minHeight: 44,
  },
  thaiInput: {
    fontSize: 22,
  },
  solution: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
