import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sentenceFootnote, SENTENCE_TASKS_BY_LANGUAGE } from '@/data/sentence-tasks';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { measureSentence, preparationRemaining, sentenceAnswers, sentenceSession, SENTENCE_WINDOWS_MS } from './sentence-session';

test('Satzaufgaben kommen aus den Beispielsätzen des Wortschatzes — Text und Bedeutung unverändert', () => {
  const tasks = SENTENCE_TASKS_BY_LANGUAGE.th;
  expect(tasks.length).toBeGreaterThan(0);
  for (const task of tasks) {
    const original = VOCABULARY_TH.find(word => word.id === task.vocabId)!;
    expect(task.text).toBe(original.exampleTerm);
    expect(task.german).toBe(original.exampleGerman);
    expect(new Set(task.answers).size).toBe(task.answers.length);
    expect(task.answers.filter(answer => answer === task.german)).toHaveLength(1);
  }
});
test('whole-sentence contrasts, stable randomised rounds and mandatory time windows', () => {
  const task = SENTENCE_TASKS_BY_LANGUAGE.th[0];
  expect(sentenceSession('th', 3)).toEqual(sentenceSession('th', 3));
  expect(sentenceSession('th', 3)).toHaveLength(Math.min(8, SENTENCE_TASKS_BY_LANGUAGE.th.length));
  expect(new Set(sentenceAnswers(task, 2))).toEqual(new Set(task.answers));
  expect(preparationRemaining(100, 101)).toBe(14999);
  expect(preparationRemaining(100, 15100)).toBe(0);
  expect(SENTENCE_WINDOWS_MS).toEqual([12000, 9000, 6000]);
});
test('measurement is local descriptive F0, with no speech-recognition or learning-state writes', () => {
  const measurement = measureSentence({ samples: new Float32Array(8000), sampleRate: 8000, durationMs: 1000, reachedLimit: true });
  expect(measurement).toMatchObject({ durationMs: 1000, reachedLimit: true, voicedFramePercent: 0, contour: { status: 'unmeasurable' } });
  for (const file of ['src/lib/speaking/sentence-session.ts', 'src/components/sentence-runner.tsx']) {
    const source = readFileSync(path.resolve(file), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(|saveAudioClip|rateCard|writeMeta|SpeechRecognition|createClipGenerationClient/);
  }
});
test('jede Lernsprache bekommt Satzaufgaben aus ihren Beispielsätzen; ohne Beispiele bleibt sie ehrlich leer', () => {
  for (const code of ['th', 'en', 'es'] as const) {
    expect(SENTENCE_TASKS_BY_LANGUAGE[code].length).toBeGreaterThan(0);
    expect(sentenceFootnote(code).length).toBeGreaterThan(10);
  }
  // Die deutschen Test-Wörter tragen keine Beispielsätze.
  expect(SENTENCE_TASKS_BY_LANGUAGE.de).toEqual([]);
  expect(sentenceSession('de', 1)).toEqual([]);
});
