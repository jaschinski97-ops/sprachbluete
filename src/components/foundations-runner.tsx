import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { TONE_KEYS, type Tone } from '@/constants/tones';
import { activeVocabularyFor } from '@/data/active-vocabulary';
import { LATIN_ALPHABETS, spellOut, type LatinLanguage, type LatinLetter } from '@/data/latin-alphabet';
import { NUMBER_EXAMPLES, NUMBER_GROUPS, numberWord, priceText, thaiDigits } from '@/data/numbers';
import { CONSONANT_MEANING_DE, THAI_CONSONANTS, type ConsonantClass, type ThaiConsonant } from '@/data/thai-script';
import type { VocabEntry } from '@/data/vocab-types';
import { useTheme } from '@/hooks/use-theme';
import { hasPronunciationClip, isLanguageAvailable, playPronunciationWithStatus, stopPronunciation } from '@/lib/audio';
import type { AudioPurpose } from '@/lib/content/audio-policy';
import { seededRandom } from '@/lib/drills/random';
import {
  FOUNDATION_SPECIAL_VOWELS,
  FOUNDATION_VOWELS,
  NUMBER_QUIZ_VALUES,
  PRICE_QUIZ_VALUES,
  numberQuestions,
  paiboonVowel,
  spellingQuestions,
  spellingWords,
  thaiConsonantKeyword,
  thaiConsonantKeywordRoman,
  thaiConsonantSpoken,
  thaiConsonantSyllable,
  toneExampleCandidates,
  toneMarkedVowel,
  vowelPattern,
  type ChoiceQuestion,
  type FoundationMode,
} from '@/lib/foundations';
import { useLocale, type TranslationKey } from '@/lib/i18n';
import { bridgeText } from '@/lib/languages/bridge';
import { targetLanguageOf, type LanguageCode, type PairDirection } from '@/lib/languages/types';
import { analyzeSyllable } from '@/lib/reading/syllable';

import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { ToneContour } from './tone-contour';
import { ToneLegend } from './tone-legend';

/**
 * Kapitel 0 „Grundlagen“ (18.10.2026): Zahlen, Preise, Schrift und — für
 * Thai — die fünf Töne. Jede Zeile lässt sich antippen und anhören. Ohne
 * Clip spricht die Systemstimme (mit ehrlicher Quellen-Zeile); ohne Stimme
 * bleibt alles lesbar und die Hörfragen werden zu Lesefragen.
 */
export function FoundationsRunner({ mode, direction, onExit }: {
  mode: FoundationMode;
  direction: PairDirection;
  onExit: () => void;
}) {
  const language = targetLanguageOf(direction);
  useEffect(() => () => { void stopPronunciation(); }, []);
  if (mode === 'zahlen') return <NumbersStep language={language} onExit={onExit} />;
  if (mode === 'preise') return <PricesStep language={language} onExit={onExit} />;
  if (language === 'th') {
    if (mode === 'konsonanten') return <ConsonantsStep />;
    if (mode === 'vokale') return <VowelsStep />;
    if (mode === 'toene') return <TonesStep />;
    return null;
  }
  if (mode === 'abc') return <AlphabetStep language={language} />;
  if (mode === 'buchstabieren') return <SpellingStep language={language} onExit={onExit} />;
  return null;
}

/* ------------------------------------------------------------------ *
 * Anhören                                                             *
 * ------------------------------------------------------------------ */

type Player = {
  play: (text: string, purpose?: AudioPurpose) => void;
  /** Quellen-Zeile der letzten Wiedergabe (Wörterbuchschlüssel). */
  status: TranslationKey | null;
  /** `false` nur, wenn das Gerät eindeutig keine Stimme für die Sprache hat. */
  voice: boolean | null;
};

function usePlayer(language: LanguageCode): Player {
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const [voice, setVoice] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    isLanguageAvailable(language).then((found) => { if (active) setVoice(found); }).catch(() => {});
    return () => { active = false; };
  }, [language]);
  const play = useCallback((text: string, purpose: AudioPurpose = 'vocabulary') => {
    playPronunciationWithStatus({ text, language, purpose })
      .then((result) => setStatus(result.label as TranslationKey))
      // Eine stumme Ausgabe darf das Kapitel nicht abbrechen.
      .catch(() => setStatus('advanced.unavailable'));
  }, [language]);
  return { play, status, voice };
}

function PlayerNote({ player }: { player: Player }) {
  const { t } = useLocale();
  if (player.voice === false) {
    return <ThemedText type="small" themeColor="textSecondary">{t('foundations.noVoice')}</ThemedText>;
  }
  return player.status
    ? <ThemedText type="small" themeColor="textSecondary">{t(player.status)}</ThemedText>
    : <ThemedText type="small" themeColor="textSecondary">{t('foundations.tapToListen')}</ThemedText>;
}

/** Eine antippbare Kachel: großes Zeichen, darunter kleine Zeilen. */
function Tile({ big, lines, onPress, a11y, wide = false }: {
  big: string;
  lines: (string | null | undefined)[];
  onPress: () => void;
  a11y: string;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [wide ? styles.tileWide : styles.tile, pressed && styles.pressed]}>
      <ThemedView type="background" style={styles.tileInner}>
        <ThemedText type="subtitle" style={styles.center}>{big}</ThemedText>
        {lines.filter((line): line is string => Boolean(line)).map((line, index) => (
          // Die erste Zeile ist das Lernwort (Thai-Schrift braucht Größe), der Rest Detail.
          <ThemedText key={`${index}:${line}`} type={index === 0 ? 'default' : 'small'} themeColor={index === 0 ? 'text' : 'textSecondary'} style={styles.center}>
            {line}
          </ThemedText>
        ))}
      </ThemedView>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

/* ------------------------------------------------------------------ *
 * Zahlen                                                              *
 * ------------------------------------------------------------------ */

function NumbersStep({ language, onExit }: { language: LanguageCode; onExit: () => void }) {
  const { t } = useLocale();
  const player = usePlayer(language);
  const [quiz, setQuiz] = useState(false);
  const groupTitle: Record<(typeof NUMBER_GROUPS)[number]['id'], string> = {
    units: '0 – 10',
    teens: '11 – 20',
    tens: t('foundations.groupTens'),
    large: t('foundations.groupLarge'),
  };
  if (quiz) {
    return <ChoiceQuiz kind="number" language={language} player={player} onExit={onExit} />;
  }
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.numbersIntro')}</ThemedText>
      <PlayerNote player={player} />
      {NUMBER_GROUPS.map((group) => (
        <Section key={group.id} title={groupTitle[group.id]}>
          <View style={styles.grid}>
            {group.values.map((value) => {
              const word = numberWord(language, value);
              return (
                <Tile
                  key={value}
                  big={language === 'th' ? `${value} · ${thaiDigits(value)}` : String(value)}
                  lines={[word.text, word.roman]}
                  a11y={`${value}: ${word.text}`}
                  onPress={() => player.play(word.text)}
                />
              );
            })}
          </View>
        </Section>
      ))}
      <Section title={t('foundations.numbersBuild')}>
        <View style={styles.grid}>
          {NUMBER_EXAMPLES.map((value) => {
            const word = numberWord(language, value);
            const tens = value - (value % 10);
            return (
              <Tile
                key={value}
                big={String(value)}
                lines={[word.text, word.roman, `${tens} + ${value % 10}`]}
                a11y={`${value}: ${word.text}`}
                onPress={() => player.play(word.text)}
              />
            );
          })}
        </View>
      </Section>
      <ThemedButton label={t('foundations.startQuiz')} variant="primary" onPress={() => setQuiz(true)} />
    </View>
  );
}

function PricesStep({ language, onExit }: { language: LanguageCode; onExit: () => void }) {
  const { t } = useLocale();
  const player = usePlayer(language);
  const [quiz, setQuiz] = useState(false);
  if (quiz) return <ChoiceQuiz kind="price" language={language} player={player} onExit={onExit} />;
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.pricesIntro')}</ThemedText>
      <PlayerNote player={player} />
      <Section title={t('foundations.prices')}>
        <View style={styles.grid}>
          {[1, 2, 5, 10, 20, 50, 90, 100].map((value) => {
            const price = priceText(language, value);
            return (
              <Tile
                key={value}
                wide
                big={price.label}
                lines={[price.text, price.roman]}
                a11y={`${price.label}: ${price.text}`}
                onPress={() => player.play(price.text)}
              />
            );
          })}
        </View>
      </Section>
      <ThemedButton label={t('foundations.startQuiz')} variant="primary" onPress={() => setQuiz(true)} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Auswahlrunde (Zahlen, Preise)                                       *
 * ------------------------------------------------------------------ */

function ChoiceQuiz({ kind, language, player, onExit }: {
  kind: 'number' | 'price';
  language: LanguageCode;
  player: Player;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const [round, setRound] = useState(0);
  const questions = useMemo(
    () => numberQuestions(kind === 'number' ? NUMBER_QUIZ_VALUES : PRICE_QUIZ_VALUES, seededRandom(Date.now() + round), kind === 'number' ? 10 : 8),
    [kind, round]
  );
  const spoken = useCallback((value: number) => (kind === 'number' ? numberWord(language, value) : priceText(language, value)), [kind, language]);
  const label = (value: number) => (kind === 'number' ? String(value) : priceText(language, value).label);
  // Jede zweite Frage nur zum Hören — solange das Gerät eine Stimme hat.
  const listenOnly = (index: number) => player.voice !== false && index % 2 === 0;
  const prompt: TranslationKey = kind === 'price' ? 'foundations.questionPrice' : 'foundations.questionNumber';

  return (
    <QuizFrame
      key={round}
      questions={questions}
      onNewRound={() => setRound((value) => value + 1)}
      onExit={onExit}
      render={(question, index, answered) => {
        const text = spoken(question.answer);
        return (
          <QuizPrompt
            title={`${t(prompt)} · ${t(listenOnly(index) ? 'foundations.byEar' : 'foundations.byEye')}`}
            text={listenOnly(index) && !answered ? null : text.text}
            roman={listenOnly(index) && !answered ? null : text.roman}
            autoPlay={listenOnly(index)}
            onPlay={() => player.play(text.text)}
            player={player}
          />
        );
      }}
      optionLabel={label}
      solution={(question) => {
        const text = spoken(question.answer);
        return [`${label(question.answer)} — ${text.text}`, text.roman];
      }}
    />
  );
}

function QuizPrompt({ title, text, roman, autoPlay, onPlay, player }: {
  title: string;
  text: string | null;
  roman?: string | null;
  autoPlay: boolean;
  onPlay: () => void;
  player: Player;
}) {
  const { t } = useLocale();
  const played = useRef(false);
  useEffect(() => {
    if (!autoPlay || played.current) return;
    played.current = true;
    onPlay();
  }, [autoPlay, onPlay]);
  return (
    <View style={styles.promptBlock}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {text ? <ThemedText type="subtitle" style={styles.center}>{text}</ThemedText> : null}
      {roman ? <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{roman}</ThemedText> : null}
      <ThemedButton label={t('drill.playAgain')} accessibilityLabel={t('drill.playAgainA11y')} onPress={onPlay} />
      <PlayerNote player={player} />
    </View>
  );
}

/** Rahmen einer Auswahlrunde: Fortschritt, Antworten, Urteil, Ergebnis. */
function QuizFrame<T>({ questions, render, optionLabel, solution, onNewRound, onExit }: {
  questions: ChoiceQuestion<T>[];
  render: (question: ChoiceQuestion<T>, index: number, answered: boolean) => React.ReactNode;
  optionLabel: (option: T) => string;
  solution: (question: ChoiceQuestion<T>) => (string | null | undefined)[];
  onNewRound: () => void;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const question = questions[index];

  if (!question) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('drill.roundDone')}</ThemedText>
        <ThemedText type="small">{t('drill.roundScore', { correct, total: questions.length })}</ThemedText>
        <View style={styles.row}>
          <ThemedButton label={t('drill.newRound')} variant="primary" onPress={onNewRound} />
          <ThemedButton label={t('common.back')} onPress={onExit} />
        </View>
      </ThemedView>
    );
  }

  const answered = chosen !== null;
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('drill.questionProgress', { index: index + 1, total: questions.length })}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {/* Je Frage neu eingehängt: das automatische Abspielen gilt jeder Frage. */}
        <View key={index}>{render(question, index, answered)}</View>
        <View style={styles.options}>
          {question.options.map((option, optionIndex) => {
            const isChosen = chosen === optionIndex;
            const isCorrect = optionIndex === question.correctIndex;
            const border = answered && isCorrect ? theme.success : answered && isChosen ? theme.error : undefined;
            return (
              <Pressable
                key={`${index}:${optionIndex}`}
                onPress={() => {
                  if (answered) return;
                  setChosen(optionIndex);
                  if (isCorrect) setCorrect((value) => value + 1);
                }}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={optionLabel(option)}
                accessibilityState={{ selected: isChosen, disabled: answered }}
                style={({ pressed }) => [styles.optionWrap, pressed && styles.pressed]}>
                <ThemedView
                  type={isChosen ? 'backgroundSelected' : 'background'}
                  style={[styles.option, border ? { borderColor: border, borderWidth: 2 } : styles.optionPlain]}>
                  <ThemedText type="default">{optionLabel(option)}</ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </View>
        {answered ? (
          <ThemedView type="backgroundSelected" style={styles.feedback}>
            <ThemedText type="smallBold" themeColor={chosen === question.correctIndex ? 'success' : 'error'}>
              {chosen === question.correctIndex ? t('drill.correct') : t('drill.wrong')}
            </ThemedText>
            {solution(question).filter((line): line is string => Boolean(line)).map((line, lineIndex) => (
              <ThemedText key={`${lineIndex}:${line}`} type="small" themeColor={lineIndex === 0 ? 'text' : 'textSecondary'}>
                {line}
              </ThemedText>
            ))}
          </ThemedView>
        ) : null}
      </ThemedView>
      {answered ? (
        <ThemedButton
          label={t('common.next')}
          variant="primary"
          onPress={() => { setChosen(null); setIndex((value) => value + 1); }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * ABC und Buchstabieren                                               *
 * ------------------------------------------------------------------ */

function letterLines(letter: LatinLetter): string[] {
  return [letter.name ?? letter.ipa, letter.name ? letter.ipa : null, letter.variant ?? null]
    .filter((line): line is string => Boolean(line));
}

function AlphabetStep({ language }: { language: LatinLanguage }) {
  const { t } = useLocale();
  const player = usePlayer(language);
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.alphabetIntro')}</ThemedText>
      <PlayerNote player={player} />
      <Section title={t('foundations.alphabet')}>
        <View style={styles.grid}>
          {LATIN_ALPHABETS[language].map((letter) => (
            <Tile
              key={letter.upper}
              big={`${letter.upper} ${letter.lower}`}
              lines={letterLines(letter)}
              a11y={`${letter.upper}: ${letter.name ?? letter.ipa}`}
              onPress={() => player.play(letter.spoken, 'general')}
            />
          ))}
        </View>
      </Section>
    </View>
  );
}

/**
 * Ein Buchstabe beim Buchstabieren: der Buchstabe selbst, dazu sein Name,
 * wo er mehr verrät als der Buchstabe (N „en“, H „hache“), sonst die
 * Aussprache (A /eɪ/). Vorher stand nur der Name oder nur die Lautschrift
 * da — „a – en – dee“ bzw. „/aː/ – /ɛl/“ (Testrunde 25.10.).
 */
function buchstabe(letter: LatinLetter): string {
  const name = letter.name && letter.name.toLowerCase() !== letter.lower ? letter.name : null;
  return `${letter.upper} ${name ?? letter.ipa}`;
}

/** Die Buchstabennamen eines Wortes — geschrieben und als Text für die Stimme. */
function spelled(language: LatinLanguage, word: string): { shown: string; spoken: string } {
  const letters = spellOut(language, word);
  return {
    shown: letters.map(buchstabe).join(' – '),
    spoken: letters.map((letter) => letter.spoken).join(', '),
  };
}

function SpellingStep({ language, onExit }: { language: LatinLanguage; onExit: () => void }) {
  const { t, uiLanguage } = useLocale();
  const player = usePlayer(language);
  const [round, setRound] = useState(0);
  const words = useMemo(() => spellingWords(language, activeVocabularyFor(language)), [language]);
  const questions = useMemo(() => spellingQuestions(words, seededRandom(Date.now() + round)), [words, round]);

  if (questions.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">{t('drill.noneFor', { drill: t('foundations.spelling') })}</ThemedText>
        <ThemedButton label={t('common.back')} onPress={onExit} />
      </ThemedView>
    );
  }

  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.spellingIntro')}</ThemedText>
      <QuizFrame
        key={round}
        questions={questions}
        onNewRound={() => setRound((value) => value + 1)}
        onExit={onExit}
        optionLabel={(entry: VocabEntry) => entry.term}
        render={(question) => {
          const letters = spelled(language, question.answer.term.toLowerCase());
          return (
            <QuizPrompt
              title={t('foundations.questionSpelling')}
              text={letters.shown}
              autoPlay={player.voice !== false}
              onPlay={() => player.play(letters.spoken, 'general')}
              player={player}
            />
          );
        }}
        solution={(question) => [
          `${question.answer.term} — ${bridgeText(question.answer, uiLanguage).text}`,
          spelled(language, question.answer.term.toLowerCase()).shown,
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Thai: Konsonanten, Vokalzeichen, Töne                               *
 * ------------------------------------------------------------------ */

const CLASS_ORDER: readonly ConsonantClass[] = ['mid', 'high', 'low'];

function useThaiVocabulary(): Map<string, VocabEntry> {
  return useMemo(() => new Map(activeVocabularyFor('th').map((entry) => [entry.term, entry])), []);
}

function consonantMeaning(consonant: ThaiConsonant, entry: VocabEntry | undefined, ui: string): string | null {
  if (ui === 'de') return CONSONANT_MEANING_DE[consonant.symbol] ?? null;
  if (ui === 'en') return consonant.meaning;
  return entry?.translations?.[ui as keyof NonNullable<VocabEntry['translations']>] ?? null;
}

function ConsonantsStep() {
  const { t, uiLanguage } = useLocale();
  const player = usePlayer('th');
  const vocabulary = useThaiVocabulary();
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.consonantsIntro')}</ThemedText>
      <PlayerNote player={player} />
      {CLASS_ORDER.map((consonantClass) => {
        const members = THAI_CONSONANTS.filter((consonant) => consonant.consonantClass === consonantClass);
        return (
          <Section key={consonantClass} title={`${t(`consonantClass.${consonantClass}`)} · ${members.length}`}>
            <View style={styles.grid}>
              {members.map((consonant) => {
                const keyword = thaiConsonantKeyword(consonant);
                const entry = vocabulary.get(keyword);
                // Feste Umschrift des Merkworts, nicht mehr aus dem Wortschatz.
                const merkwort = thaiConsonantKeywordRoman(consonant);
                const name = `${thaiConsonantSyllable(consonant)}${merkwort ? ` ${merkwort}` : ''}`;
                return (
                  <Tile
                    key={consonant.symbol}
                    wide
                    big={consonant.symbol}
                    lines={[consonant.name, name, consonantMeaning(consonant, entry, uiLanguage)]}
                    a11y={`${consonant.name}, ${name}`}
                    onPress={() => player.play(thaiConsonantSpoken(consonant))}
                  />
                );
              })}
            </View>
          </Section>
        );
      })}
    </View>
  );
}

/** Ein einsilbiges Katalogwort je Vokalmuster — gefunden über die Silbenanalyse, nicht ausgedacht. */
function useVowelExamples(vocabulary: Map<string, VocabEntry>): Map<string, VocabEntry> {
  return useMemo(() => {
    const byPattern = new Map<string, VocabEntry>();
    const words = [...vocabulary.values()]
      .filter((entry) => entry.syllables.length === 1)
      .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id));
    for (const entry of words) {
      const analysis = analyzeSyllable(entry.term);
      if (!analysis.ok || analysis.uncertain || !analysis.vowel.pattern) continue;
      const display = analysis.vowel.pattern.display;
      if (!byPattern.has(display)) byPattern.set(display, entry);
    }
    return byPattern;
  }, [vocabulary]);
}

function VowelSide({ displays, examples, label, onPlay }: {
  displays: readonly string[];
  examples: Map<string, VocabEntry>;
  label: string;
  onPlay: (text: string) => void;
}) {
  const pattern = vowelPattern(displays[0]);
  const example = displays.map((display) => examples.get(display)).find(Boolean);
  return (
    <Tile
      wide
      big={displays.join('  ')}
      lines={[`${paiboonVowel(pattern)} · ${label}`, example ? `${example.term} ${example.romanization}` : null]}
      a11y={`${displays.join(', ')}: ${paiboonVowel(pattern)}, ${label}${example ? `, ${example.term}` : ''}`}
      onPress={() => { if (example) onPlay(example.term); }}
    />
  );
}

function VowelsStep() {
  const { t } = useLocale();
  const player = usePlayer('th');
  const vocabulary = useThaiVocabulary();
  const examples = useVowelExamples(vocabulary);
  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.vowelsIntro')}</ThemedText>
      <PlayerNote player={player} />
      <Section title={`${t('foundations.short')} · ${t('foundations.long')}`}>
        {FOUNDATION_VOWELS.map((pair) => (
          <View key={pair.short[0]} style={styles.pairRow}>
            <VowelSide displays={pair.short} examples={examples} label={t('foundations.short')} onPlay={(text) => player.play(text)} />
            <VowelSide displays={pair.long} examples={examples} label={t('foundations.long')} onPlay={(text) => player.play(text)} />
          </View>
        ))}
      </Section>
      <Section title={t('foundations.specialVowels')}>
        <View style={styles.grid}>
          {FOUNDATION_SPECIAL_VOWELS.map((display) => (
            <VowelSide key={display} displays={[display]} examples={examples} label={t(vowelPattern(display).length === 'short' ? 'foundations.short' : 'foundations.long')} onPlay={(text) => player.play(text)} />
          ))}
        </View>
      </Section>
    </View>
  );
}

const TONE_NAME_KEYS: Record<Tone, TranslationKey> = {
  mid: 'tone.mid', low: 'tone.low', falling: 'tone.falling', high: 'tone.high', rising: 'tone.rising',
};

function TonesStep() {
  const { t, uiLanguage } = useLocale();
  const player = usePlayer('th');
  const vocabulary = useThaiVocabulary();
  const candidates = useMemo(() => toneExampleCandidates([...vocabulary.values()]), [vocabulary]);
  // Je Ton das erste Wort mit TONGEPRÜFTEM Clip; ohne Clip nur geschrieben.
  const [examples, setExamples] = useState<Partial<Record<Tone, { entry: VocabEntry; clip: boolean }>>>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      const found: Partial<Record<Tone, { entry: VocabEntry; clip: boolean }>> = {};
      for (const tone of TONE_KEYS) {
        const list = candidates[tone];
        let pick: { entry: VocabEntry; clip: boolean } | undefined;
        for (const entry of list) {
          if (await hasPronunciationClip({ text: entry.term, language: 'th', purpose: 'tone' }).catch(() => false)) {
            pick = { entry, clip: true };
            break;
          }
        }
        found[tone] = pick ?? (list[0] ? { entry: list[0], clip: false } : undefined);
      }
      if (active) setExamples(found);
    })();
    return () => { active = false; };
  }, [candidates]);

  return (
    <View style={styles.root}>
      <ThemedText type="small" themeColor="textSecondary">{t('foundations.tonesIntro')}</ThemedText>
      <ToneLegend />
      <PlayerNote player={player} />
      {TONE_KEYS.map((tone) => {
        const example = examples[tone];
        return (
          <ThemedView key={tone} type="backgroundElement" style={styles.toneRow}>
            <View style={styles.toneHead}>
              <ToneContour tone={tone} height={18} />
              <ThemedText type="smallBold">{t(TONE_NAME_KEYS[tone])} · {toneMarkedVowel(tone)}</ThemedText>
            </View>
            {example ? (
              <Pressable
                onPress={() => { if (example.clip) player.play(example.entry.term, 'tone'); }}
                disabled={!example.clip}
                accessibilityRole="button"
                accessibilityLabel={`${example.entry.term}, ${example.entry.romanization}`}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="thaiMedium">{example.entry.term}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {example.entry.romanization} · {bridgeText(example.entry, uiLanguage).text}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t(example.clip ? 'foundations.tapToListen' : 'foundations.toneNoClip')}
                </ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 88,
    minWidth: 88,
  },
  tileWide: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
  },
  tileInner: {
    minHeight: 64,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  pairRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toneRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  toneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  promptBlock: {
    alignItems: 'center',
    gap: Spacing.two,
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
    alignItems: 'center',
    justifyContent: 'center',
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
