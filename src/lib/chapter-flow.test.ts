import type { VocabEntry } from '@/data/vocab-types';

import { canDoList, CAN_DO_KEYS } from './can-do';
import { buildChapterCheck, checkPassed } from './chapter-check';
import { chapterPhases, chapterSteps, defaultStage, nextChapterId, nextOpenStep, nextStepFor } from './chapter-flow';
import type { ConversationSituation } from './conversation/types';
import { TOPICS } from './conversation/types';
import { FOUNDATIONS_ID } from './foundations';
import { grammarOverview, ruleTheme } from './grammar-overview';
import type { LearningChapter } from './learning-path';

function situation(id: string, topic: ConversationSituation['topic'], level: ConversationSituation['level']): ConversationSituation {
  return {
    id, topic, level, direction: 'de_to_en', title: id, setting: '',
    scriptTurns: [
      { speaker: 'partner', thai: 'Hello!', roman: '', german: 'Hallo!' },
      { speaker: 'learner', thai: 'Good morning.', roman: '', german: 'Guten Morgen.' },
      { speaker: 'partner', thai: 'How are you?', roman: '', german: 'Wie geht es dir?' },
      { speaker: 'learner', thai: 'Fine, thanks.', roman: '', german: 'Gut, danke.' },
    ],
    corrections: [
      { issue: 'Regel eins', explanation: 'Erklärung eins' },
      { issue: 'Regel zwei', explanation: 'Erklärung zwei' },
    ],
    generatedAt: 1, modelUsed: 'test',
  };
}

function word(id: string, term: string, german: string): VocabEntry {
  return {
    id, term, german, language: 'en', romanization: term, partOfSpeech: 'noun', register: 'neutral',
    isConcrete: true, sourceVerified: false, syllables: [], generatedAt: 1,
  };
}

const WORDS = [
  word('w1', 'apple', 'Apfel'), word('w2', 'bread', 'Brot'), word('w3', 'water', 'Wasser'),
  word('w4', 'milk', 'Milch'), word('w5', 'tea', 'Tee'), word('w6', 'rice', 'Reis'),
];

const chapter = (id: string, topic: ConversationSituation['topic'], level: ConversationSituation['level']): LearningChapter =>
  ({ id, situation: situation(id, topic, level), vocabulary: WORDS });

const A = chapter('greeting-A1', 'greeting', 'A1');
const B = chapter('market-A1', 'market', 'A1');
const C = chapter('work-B1', 'work', 'B1');

test('ein Kapitel hat acht Schritte in vier Phasen, der Check zuletzt', () => {
  const steps = chapterSteps('de_to_en', A);
  expect(steps).toHaveLength(8);
  expect(steps[0][0]).toBe('sentenceListening');
  expect(steps[7][0]).toBe('kapitelCheck');
  // Die Regelübersicht ist keine Übung und nie Schritt 4.
  expect(steps[3][0]).not.toBe('grammatikRegeln');
  const phases = chapterPhases(steps);
  expect(phases.map((phase) => phase.title)).toEqual(['phase.understand', 'phase.learn', 'phase.apply', 'phase.check']);
  expect(phases.flatMap((phase) => phase.steps.map((entry) => entry.index))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test('der nächste Schritt ist der erste noch nicht geöffnete', () => {
  const steps = chapterSteps('de_to_en', A);
  expect(nextOpenStep(steps, [])).toBe(0);
  expect(nextOpenStep(steps, ['sentenceListening', 'cards'])).toBe(1);
  expect(nextOpenStep(steps, steps.map(([mode]) => mode))).toBe(steps.length);
});

test('Anfänger beginnen mit Kapitel 0, danach das erste offene Kapitel ihrer Stufe', () => {
  expect(nextChapterId([A, B, C], [], 'beginner')).toBe(FOUNDATIONS_ID);
  expect(nextChapterId([A, B, C], [FOUNDATIONS_ID], 'beginner')).toBe('greeting-A1');
  expect(nextChapterId([A, B, C], [FOUNDATIONS_ID, 'greeting-A1'], 'beginner')).toBe('market-A1');
  expect(nextChapterId([A, B, C], [], 'experienced')).toBe('work-B1');
  // Stufe fertig: weiter mit dem ersten offenen Kapitel überhaupt.
  expect(nextChapterId([A, B, C], [FOUNDATIONS_ID, 'work-B1'], 'experienced')).toBe('greeting-A1');
  expect(nextChapterId([A, B, C], [FOUNDATIONS_ID, 'greeting-A1', 'market-A1', 'work-B1'], 'beginner')).toBeNull();
});

test('nextStepFor nennt Kapitel, Stelle in der Stufe und den offenen Schritt', () => {
  const next = nextStepFor('de_to_en', [A, B, C], [FOUNDATIONS_ID, 'greeting-A1'], { 'market-A1': ['sentenceListening'] }, 'beginner');
  expect(next).toMatchObject({ chapterId: 'market-A1', foundations: false, position: 2, stageCount: 2, stepIndex: 1, stepCount: 8 });
  expect(next?.step?.[0]).toBe('lesestoffe');
  const foundations = nextStepFor('de_to_en', [A, B, C], [], {}, 'beginner');
  expect(foundations).toMatchObject({ chapterId: FOUNDATIONS_ID, foundations: true, chapter: null, stageCount: 2, stepIndex: 0 });
});

test('ohne eigene Wahl gilt die Stufe des nächsten offenen Kapitels', () => {
  expect(defaultStage([A, B, C], [], null)).toBe('beginner');
  expect(defaultStage([A, B, C], ['greeting-A1', 'market-A1'], null)).toBe('experienced');
  expect(defaultStage([A, B, C], [], 'pro')).toBe('pro');
  expect(defaultStage([], [], null)).toBe('beginner');
});

test('die Kann-Liste zählt abgeschlossene Kapitel je Thema und Stufe', () => {
  const zweites = chapter('greeting-A2', 'greeting', 'A2');
  const list = canDoList([A, zweites, B, C], ['greeting-A1', 'market-A1']);
  expect(list.map((item) => [item.key, item.status, item.done, item.total])).toEqual([
    ['cando.greeting.beginner', 'started', 1, 2],
    ['cando.market.beginner', 'done', 1, 1],
    ['cando.work.experienced', 'open', 0, 1],
  ]);
});

test('eine Kann-Aussage „sitzt“ erst mit bestandenem Nachtest in allen Kapiteln', () => {
  const zweites = chapter('greeting-A2', 'greeting', 'A2');
  const sicher = { passedAt: 0, rechecks: 1, recheckAt: 0, secured: true };
  const offen = { ...sicher, secured: false };
  const status = (checks: Record<string, typeof sicher>) =>
    canDoList([A, zweites], ['greeting-A1', 'greeting-A2'], checks)[0];
  expect(status({})).toMatchObject({ status: 'done', secured: 0 });
  expect(status({ 'greeting-A1': sicher })).toMatchObject({ status: 'done', secured: 1 });
  expect(status({ 'greeting-A1': sicher, 'greeting-A2': offen }).status).toBe('done');
  expect(status({ 'greeting-A1': sicher, 'greeting-A2': sicher })).toMatchObject({ status: 'secured', secured: 2 });
  // Ein Nachtest-Eintrag ohne Abschluss zählt nicht.
  expect(canDoList([A, zweites], [], { 'greeting-A1': sicher, 'greeting-A2': sicher })[0].status).toBe('open');
});

test('jede Kann-Aussage gehört zu einem Thema, das es in der Stufe gibt', () => {
  const stufen: Record<string, string[]> = { beginner: ['A1', 'A2'], experienced: ['B1', 'B2'], pro: ['C1', 'C2'] };
  for (const key of Object.keys(CAN_DO_KEYS)) {
    const [topic, stage] = key.split('.');
    const levels = TOPICS.find((entry) => entry.id === topic)?.levels as readonly string[] | undefined;
    expect(levels?.some((level) => stufen[stage].includes(level))).toBe(true);
  }
});

test('der Kapitel-Check fragt Wörter, Schreibfragen und Dialogsätze', () => {
  const questions = buildChapterCheck(A, 'de_to_en', 'de', 7);
  expect(questions.map((question) => question.kind)).toEqual([
    'word', 'word', 'word', 'write', 'write', 'sentence', 'sentence', 'sentence',
  ]);
  const choices = questions.filter((question) => question.kind !== 'write');
  for (const question of choices) {
    expect(new Set(question.options).size).toBe(question.options.length);
    expect(question.correctIndex).toBeGreaterThanOrEqual(0);
  }
  const apple = questions.find((question) => question.kind === 'word' && question.vocabId === 'w1');
  if (apple) expect(apple.options[apple.correctIndex]).toBe('Apfel');
  // Gleiche Aussaat, gleicher Check.
  expect(buildChapterCheck(A, 'de_to_en', 'de', 7)).toEqual(questions);
});

test('Schreibfragen nehmen andere Wörter und verraten ihre Lösung nicht', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const questions = buildChapterCheck(A, 'de_to_en', 'de', seed);
    const words = questions.filter((question) => question.kind === 'word');
    const written = questions.filter((question) => question.kind === 'write');
    expect(written).toHaveLength(2);
    for (const question of written) {
      expect(question.writing?.vocabId).toBe(question.vocabId);
      expect(question.correctIndex).toBe(-1);
      expect(question.options).toEqual([]);
      expect(question.writing?.targets).toContain(WORDS.find((entry) => entry.id === question.vocabId)?.term);
      expect(words.some((other) => other.vocabId === question.vocabId)).toBe(false);
      // Die gefragte Bedeutung stand oben nicht als richtige Antwort da.
      expect(words.some((other) => other.options[other.correctIndex] === question.prompt)).toBe(false);
    }
  }
});

test('bestanden ab 80 Prozent', () => {
  expect(checkPassed(7, 8)).toBe(true);
  expect(checkPassed(6, 8)).toBe(false);
  expect(checkPassed(0, 0)).toBe(false);
});

test('die Regelübersicht ordnet Regeln nach Thema und zeigt ihren Stand', () => {
  const groups = grammarOverview('de_to_en', [A], ['greeting-A1'], {}, 'de');
  const rules = groups.flatMap((group) => group.rules);
  expect(rules.map((rule) => rule.issue)).toEqual(['Regel eins', 'Regel zwei']);
  expect(rules.every((rule) => rule.status === 'done' && rule.theme === 'weitere')).toBe(true);
  const grammarMode = chapterSteps('de_to_en', B)[3][0];
  const open = grammarOverview('de_to_en', [B], [], { 'market-A1': [grammarMode] }, 'de');
  expect(open[0].rules[0].status).toBe('practised');
  const sicher = { passedAt: 0, rechecks: 1, recheckAt: 0, secured: true };
  const secured = grammarOverview('de_to_en', [A], ['greeting-A1'], {}, 'de', { 'greeting-A1': sicher });
  expect(secured.flatMap((group) => group.rules).every((rule) => rule.status === 'secured')).toBe(true);
});

test('Regeln mit Zuordnung bekommen ihr Thema', () => {
  expect(ruleTheme('appointments-A1-de_to_en-001', 0)).toBe('mengen');
  expect(ruleTheme('appointments-A1-de_to_en-001', 1)).toBe('verbinden');
  expect(ruleTheme('gibt-es-nicht', 0)).toBe('weitere');
});
