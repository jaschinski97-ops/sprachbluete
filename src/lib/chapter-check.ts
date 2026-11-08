import { readingOf, termWithArticle } from '@/data/vocab-helpers';
import type { VocabEntry } from '@/data/vocab-types';
import { dialogueSentenceTasks } from '@/data/sentence-tasks';

import { seededRandom, shuffled } from './drills/random';
import type { UiLanguage } from './i18n/types';
import { zeigtUmschrift } from './languages/definitions';
import { targetLanguageOf, type PairDirection } from './languages/types';
import type { LearningChapter } from './learning-path';
import { ankerwortFuer, buildWritingPrompt, canBuildWritingPrompt, type WritingPrompt } from './writing/prompt';

/**
 * Der Kapitel-Check (08.11.2026): der letzte Schritt eines Kapitels. Wer ihn
 * besteht, hat das Kapitel abgeschlossen — vorher war „abgeschlossen“ nur ein
 * Knopf, den man jederzeit drücken konnte. Geprüft wird, was das Kapitel
 * geübt hat: seine Wörter (Bedeutung erkennen), zwei davon selbst schreiben,
 * und seine Dialogsätze (hören und verstehen). Keine neuen Inhalte, keine KI.
 *
 * Die Schreibfragen (seit 08.11.2026, zweite Runde): Auswahlfragen prüfen nur
 * das Wiedererkennen; wer das Wort selbst hervorbringt, zeigt mehr. Geprüft
 * wird wie in der Schreibübung (`compareWriting`: Synonyme, Kana, Artikel).
 */

export const CHECK_WORDS = 3;
export const CHECK_WRITTEN = 2;
export const CHECK_SENTENCES = 3;
/** Ab diesem Anteil richtiger Antworten gilt der Check als bestanden. */
export const CHECK_PASS = 0.8;

export type CheckQuestion = {
  id: string;
  /** Bedeutung wählen, Wort selbst schreiben oder Satz verstehen. */
  kind: 'word' | 'write' | 'sentence';
  /** Nur bei Wörtern: wohin die Antwort im Übungsgedächtnis geht. */
  vocabId?: string;
  /** Wort oder Satz in der Lernsprache. */
  prompt: string;
  /** Lesehilfe bei eigenen Schriften (Thai, Chinesisch, Japanisch). */
  roman?: string;
  /** Bedeutungen in der App-Sprache; leer bei Schreibfragen. */
  options: string[];
  /** −1 bei Schreibfragen. */
  correctIndex: number;
  /** Nur bei Schreibfragen: Auftrag, zulässige Antworten und Lösung. */
  writing?: WritingPrompt;
};

const unique = (items: readonly string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

export function buildChapterCheck(
  chapter: LearningChapter,
  direction: PairDirection,
  uiLanguage: UiLanguage,
  seed: number,
  /** Bestand für Synonyme der Schreibfragen; Vorgabe: die Wörter des Kapitels. */
  pool: readonly VocabEntry[] = chapter.vocabulary
): CheckQuestion[] {
  const random = seededRandom(seed);
  const target = targetLanguageOf(direction);
  const lesehilfe = zeigtUmschrift(target);
  const words = chapter.vocabulary
    .map((entry) => ({ entry, meaning: ankerwortFuer(entry, direction).trim() }))
    .filter((word) => word.meaning);
  const meanings = unique(words.map((word) => word.meaning));

  const wordQuestions: CheckQuestion[] = [];
  for (const { entry, meaning } of shuffled(words, random)) {
    if (wordQuestions.length >= CHECK_WORDS) break;
    // Zwei Wörter mit derselben Bedeutung würden zwei richtige Antworten zeigen.
    if (wordQuestions.some((question) => question.options[question.correctIndex] === meaning)) continue;
    const distractors = shuffled(meanings.filter((other) => other !== meaning), random).slice(0, 3);
    if (distractors.length < 2) continue;
    const options = shuffled([meaning, ...distractors], random);
    wordQuestions.push({
      id: `w:${entry.id}`,
      kind: 'word',
      vocabId: entry.id,
      prompt: entry.language === target ? termWithArticle(entry) : entry.term,
      roman: lesehilfe ? readingOf(entry) : undefined,
      options,
      correctIndex: options.indexOf(meaning),
    });
  }

  // Selbst schreiben: andere Wörter als oben und keine Bedeutung, die oben
  // schon als richtige Antwort stand — sonst stünde die Lösung schon da.
  const asked = new Set(wordQuestions.map((question) => question.options[question.correctIndex]));
  const askedIds = new Set(wordQuestions.map((question) => question.vocabId));
  const writeQuestions: CheckQuestion[] = [];
  for (const { entry, meaning } of shuffled(words, random)) {
    if (writeQuestions.length >= CHECK_WRITTEN) break;
    if (askedIds.has(entry.id) || asked.has(meaning) || !canBuildWritingPrompt(entry, direction)) continue;
    const writing = buildWritingPrompt(entry, direction, [...pool]);
    asked.add(meaning);
    writeQuestions.push({
      id: `t:${entry.id}`,
      kind: 'write',
      vocabId: entry.id,
      prompt: writing.shown,
      options: [],
      correctIndex: -1,
      writing,
    });
  }

  const sentenceQuestions = shuffled(dialogueSentenceTasks(chapter.situation, uiLanguage), random)
    .filter((task) => unique(task.answers).length >= 3)
    .slice(0, CHECK_SENTENCES)
    .map((task): CheckQuestion => {
      const correct = task.meaning ?? task.answers[0];
      const options = shuffled(unique(task.answers), random);
      return {
        id: `s:${task.id}`,
        kind: 'sentence',
        prompt: task.text,
        roman: lesehilfe && task.roman ? task.roman : undefined,
        options,
        correctIndex: options.indexOf(correct),
      };
    });

  return [...wordQuestions, ...writeQuestions, ...sentenceQuestions];
}

export function checkPassed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= CHECK_PASS;
}
