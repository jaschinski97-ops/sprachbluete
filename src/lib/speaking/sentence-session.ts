import type { CapturedPcm } from './microphone-capture';
import { analyzeToneContour, type ToneContourMeasurement } from './analysis';
import { buildSentenceTasks, dialogueSentenceTasks, satzaufgabenFuer, type SatzSprache, type SentenceTask } from '@/data/sentence-tasks';
import { bundledDocuments } from '../content/bundled';
import { targetLanguageOf } from '../languages/types';
import type { VocabEntry } from '@/data/vocab-types';
import type { UiLanguage } from '@/lib/i18n/types';
import { shuffled, seededRandom } from '../drills/random';

export const SENTENCE_PREPARATION_MS = 15_000;
export const SENTENCE_SESSION_SIZE = 8;
/** 4:3:2 ratio for short sentences, not Nation's 4/3/2-minute talks. */
export const SENTENCE_WINDOWS_MS = [12_000, 9_000, 6_000] as const;
export type SentenceMode = 'shadowing' | 'sentenceRepeat' | 'sentenceListening';
/**
 * Die Satzaufgaben der gewählten Zielsprache (AE-66).
 *
 * Vorher stand hier das Thai-Array fest verdrahtet — die Übungen gab es nur
 * unter „Deutsch → Thai". Seit AE-66 gehören sie zu jeder Richtung jedes
 * Paars; welche Sprache tatsächlich Satzstoff hat, entscheidet die Registry
 * in `data/sentence-tasks.ts` allein. Seit dem 18.09.2026 umfasst der
 * Schlüssel auch `de` — der Deutsch-Kurs (th_to_de) produziert deutsche
 * Sätze aus demselben generierten Bestand.
 *
 * SEIT DEM 21.09.2026 AUCH ANKERBEWUSST: Auf der de-Brücke fragt „Satz
 * verstehen" deutsche Bedeutungen ab, auf jeder anderen Brücke erkennt man
 * den gehört Zielsatz in der Schrift (siehe `buildSentenceTasks`).
 */
export function sentenceSession(
  language: SatzSprache,
  seed: number,
  anchor: UiLanguage = 'de',
  words?: VocabEntry[]
): SentenceTask[] {
  const tasks = anchor !== 'de' && !words
    ? bundledDocuments('situations').filter(scene => targetLanguageOf(scene.direction) === language)
      .flatMap(scene => dialogueSentenceTasks(scene, anchor))
    : words ? buildSentenceTasks(words, anchor) : satzaufgabenFuer(language, anchor);
  return shuffled(tasks, seededRandom(seed))
    .slice(0, SENTENCE_SESSION_SIZE);
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
