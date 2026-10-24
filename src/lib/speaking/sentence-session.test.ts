import { readFileSync } from 'node:fs';
import path from 'node:path';
import { satzwortschatz, sentenceFootnote, SENTENCE_TASKS_BY_LANGUAGE } from '@/data/sentence-tasks';
import { setCurrentCatalog } from '@/lib/content/catalog-state';
import { bundledDocuments } from '@/lib/content/bundled';
import { createCardState } from '@/lib/fsrs/fsrs';
import type { FSRSCardState } from '@/lib/fsrs/types';
import { FIXTURE_CATALOG } from '@/test-fixtures/fixture-catalog';
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

describe('mitwachsender Satzpool ohne Kapitel (24.10.2026)', () => {
  const T0 = Date.UTC(2026, 9, 24);
  const DAY = 24 * 60 * 60 * 1000;
  /** Ein großer Thai-Bestand: 300 Wörter, w0 am häufigsten; optional mit englischer Satzbedeutung. */
  function katalog(mitEnglisch: boolean) {
    const vorlage = FIXTURE_CATALOG.entries.find((entry) => entry.kind === 'vocabulary'
      && (entry.document as { language: string }).language === 'th')!;
    const woerter = Array.from({ length: 300 }, (_, i) => ({
      ...vorlage,
      id: `vokabular:th:w${i}`,
      document: {
        ...vorlage.document, id: `w${i}`, term: `w${i}`, generatedAt: 1000 + i, learningStage: undefined,
        exampleTerm: `ประโยค ${i}`, exampleRoman: `bprà-yòok ${i}`, exampleGerman: `Satz ${i}`,
        ...(mitEnglisch ? { exampleTranslations: { en: `Sentence ${i}` } } : {}),
      },
    }));
    const andere = FIXTURE_CATALOG.entries.filter((entry) => entry.kind !== 'vocabulary');
    return { ...FIXTURE_CATALOG, entries: [...woerter, ...andere] };
  }
  /** Eine gelernte, fällige Karte (wacklig). */
  function wacklig(id: string): FSRSCardState {
    return { ...createCardState(id, 'de_to_th', T0), state: 'review', difficulty: 5, stability: 2, lastReview: T0 - 20 * DAY, reps: 3 };
  }
  const nummer = (vocabId: string) => Number(vocabId.slice(1));
  afterEach(() => setCurrentCatalog(FIXTURE_CATALOG));

  it('ohne Lernstand: die häufigsten Wörter der Stufe', () => {
    setCurrentCatalog(katalog(false) as never);
    const runde = sentenceSession('th', 5, 'de');
    expect(runde).toHaveLength(8);
    expect(runde.every((task) => nummer(task.vocabId) < 24)).toBe(true);
  });

  it('der Pool wächst mit gelernten Wörtern — auch jenseits der früheren 400er-Grenze', () => {
    setCurrentCatalog(katalog(false) as never);
    expect(satzwortschatz('th')).toHaveLength(300);
    const gelernt = ['w120', 'w200', 'w250', 'w280', 'w299'];
    const context = { cards: new Map(gelernt.map((id) => [id, wacklig(id)])), practice: new Map(), now: T0 };
    const runde = sentenceSession('th', 5, 'de', undefined, undefined, context).map((task) => task.vocabId);
    expect(runde).toEqual(expect.arrayContaining(gelernt));
    // Höchstens 20 % neue Wörter, wenn es Gelerntes gibt.
    expect(runde.filter((id) => !gelernt.includes(id)).length).toBeLessThanOrEqual(3);

    // Wörter nur aus dem Übungsgedächtnis (falsch beantwortet) zählen auch als bekannt.
    const practice = new Map([['w222', { vocabId: 'w222', total: 1, correct: 0, streak: 0, lastAt: T0 - DAY, lastCorrect: false }]]);
    const mitUebung = sentenceSession('th', 5, 'de', undefined, undefined, { cards: new Map(), practice, now: T0 });
    expect(mitUebung.map((task) => task.vocabId)).toContain('w222');
  });

  it('nicht-deutsche App-Sprache bekommt Beispielsätze mit gelieferter Bedeutung', () => {
    setCurrentCatalog(katalog(true) as never);
    const runde = sentenceSession('th', 5, 'en');
    expect(runde).toHaveLength(8);
    for (const task of runde) {
      expect(task.vocabId).not.toBe('');
      expect(task.meaning).toBe(`Sentence ${nummer(task.vocabId)}`);
      expect(task.answers[0]).toBe(task.meaning);
      expect(task.answers.every((answer) => answer.startsWith('Sentence '))).toBe(true);
    }
  });

  it('ohne Satzübersetzung fallen nicht-deutsche Oberflächen auf Dialogsätze zurück', () => {
    setCurrentCatalog(katalog(false) as never);
    const dialoge = bundledDocuments('situations').filter((scene) => scene.direction.endsWith('_to_th'));
    const runde = sentenceSession('th', 5, 'en');
    expect(runde.every((task) => task.vocabId === '')).toBe(true);
    if (dialoge.some((scene) => scene.translations?.en)) expect(runde.length).toBeGreaterThan(0);
  });
});

