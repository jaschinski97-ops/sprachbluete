import type { CapturedPcm } from './microphone-capture';
import { analyzeToneContour, type ToneContourMeasurement } from './analysis';
import { buildSentenceTasks, dialogueSentenceTasks, satzwortschatz, type SatzSprache, type SentenceTask } from '@/data/sentence-tasks';
import { exampleMeaning } from '../example-meaning';
import { selectPracticeWords } from '../practice-selection';
import type { PracticeContext } from '../word-practice';
import { bundledDocuments } from '../content/bundled';
import { targetLanguageOf } from '../languages/types';
import { stageForLevel, type LearningStage } from '../learning-stages';
import type { VocabEntry } from '@/data/vocab-types';
import type { UiLanguage } from '@/lib/i18n/types';
import { shuffled, seededRandom } from '../drills/random';

export const SENTENCE_PREPARATION_MS = 15_000;
export const SENTENCE_SESSION_SIZE = 8;
/** 4:3:2 ratio for short sentences, not Nation's 4/3/2-minute talks. */
export const SENTENCE_WINDOWS_MS = [12_000, 9_000, 6_000] as const;
export type SentenceMode = 'shadowing' | 'sentenceRepeat' | 'sentenceListening';
/** Ohne Lernstand: leerer Kontext — die Auswahl nimmt dann die häufigsten Wörter. */
const OHNE_LERNSTAND: PracticeContext = { cards: new Map(), practice: new Map(), now: 0 };

/**
 * Die Satzaufgaben einer Runde (AE-66, Anker seit 21.09.2026).
 *
 * - Mit Wortliste (Kapitel): Sätze genau dieser Wörter, gemischt.
 * - Ohne Wortliste: MITWACHSENDER POOL (24.10.2026). Aus allen Wörtern der
 *   Stufe mit Beispielsatz UND gelieferter Bedeutung in der Ankersprache wählt
 *   `selectPracticeWords`: wacklige gelernte Wörter zuerst (Karte bewertet
 *   oder im Übungsgedächtnis), wenige neue in Häufigkeitsreihenfolge, sonst
 *   sichere. Ohne Lernstand sind das die häufigsten Wörter der Stufe. Die
 *   feste Grenze der ersten 400 Wörter gibt es nicht mehr.
 * - Reichen die Wortsätze nicht (z. B. Bestand ohne `exampleTranslations`
 *   auf einer nicht-deutschen Oberfläche), füllen Dialogsätze der Stufe auf.
 */
export function sentenceSession(
  language: SatzSprache,
  seed: number,
  anchor: UiLanguage = 'de',
  words?: VocabEntry[],
  /** Ohne eigene Wortliste: nur Stoff dieser Stufe (18.10.2026). */
  stage?: LearningStage,
  /** Kartenstand und Übungsgedächtnis für den mitwachsenden Pool. */
  context: PracticeContext = OHNE_LERNSTAND
): SentenceTask[] {
  const random = seededRandom(seed);
  if (words) return shuffled(buildSentenceTasks(words, anchor), random).slice(0, SENTENCE_SESSION_SIZE);
  const pool = satzwortschatz(language, stage).filter((word) => exampleMeaning(word, anchor));
  const auswahl = selectPracticeWords(pool, {
    ...context, idOf: (word) => word.id, size: SENTENCE_SESSION_SIZE, random, knownFromPractice: true,
  });
  const tasks = buildSentenceTasks(auswahl, anchor, pool);
  if (tasks.length < SENTENCE_SESSION_SIZE) {
    const dialog = bundledDocuments('situations').filter(scene => targetLanguageOf(scene.direction) === language
      && (!stage || stageForLevel(scene.level) === stage))
      .flatMap(scene => dialogueSentenceTasks(scene, anchor));
    tasks.push(...shuffled(dialog, random).slice(0, SENTENCE_SESSION_SIZE - tasks.length));
  }
  return shuffled(tasks, random);
}
export function sentenceAnswers(task: SentenceTask, seed: number): string[] {
  return shuffled(task.answers, seededRandom(seed));
}
export function preparationRemaining(startedAt: number, now: number): number {
  return Math.max(0, SENTENCE_PREPARATION_MS - Math.max(0, now - startedAt));
}
export type SentenceMeasurement = { durationMs: number; reachedLimit: boolean;
  voicedFramePercent: number; contour: ToneContourMeasurement };
/** Measures the microphone only. Never compares to TTS, recognises words, or writes FSRS. */
export function measureSentence(capture: CapturedPcm): SentenceMeasurement {
  const contour = analyzeToneContour(capture.samples, capture.sampleRate);
  return { durationMs: capture.durationMs, reachedLimit: capture.reachedLimit,
    voicedFramePercent: contour.frames.length ? Math.round(100 * contour.frames.filter(frame => frame.f0 > 0).length / contour.frames.length) : 0,
    contour };
}
