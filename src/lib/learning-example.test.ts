import type { VocabEntry } from '@/data/vocab-types';
import { dialogueSentenceTasks } from '@/data/sentence-tasks';
import type { ConversationSituation } from './conversation/types';
import { learningExample } from './learning-example';

const scene: ConversationSituation = {
  id: 'test', direction: 'th_to_de', level: 'A1', topic: 'greeting', title: 'Greeting', setting: '',
  scriptTurns: [
    { speaker: 'partner', thai: '', german: 'Hallo! Wie heißt du?', targetText: 'Hallo! Wie heißt du?', roman: 'pseudo reading' },
    { speaker: 'learner', thai: '', german: 'Ich heiße Anna.', targetText: 'Ich heiße Anna.', roman: '' },
  ], corrections: [], modelUsed: 'test', generatedAt: 1,
  translations: { th: { title: 'ทักทาย', setting: '', turns: ['สวัสดี คุณชื่ออะไร?', 'ฉันชื่ออันนา'], corrections: [] } },
};
const entry = { id: 'hallo', language: 'de', term: 'Hallo', exampleTerm: 'An unrelated example.', exampleGerman: 'Ein fremdes Beispiel.' } as VocabEntry;

test('Chapter examples and sentence answers use complete supplied meanings', () => {
  expect(learningExample(entry, 'th', scene)).toMatchObject({ text: 'Hallo! Wie heißt du?', meaning: 'สวัสดี คุณชื่ออะไร?' });
  const tasks = dialogueSentenceTasks(scene, 'th');
  expect(tasks).toHaveLength(2);
  expect(tasks[0].meaning).toBe('สวัสดี คุณชื่ออะไร?');
  expect(tasks[0].answers).toEqual(['สวัสดี คุณชื่ออะไร?', 'ฉันชื่ออันนา']);
  expect(new Set(tasks[0].answers).size).toBe(tasks[0].answers.length);
});
test('Missing foreign translations never fall back to German as a complete meaning', () => {
  expect(dialogueSentenceTasks(scene, 'ar')).toEqual([]);
  expect(learningExample(entry, 'ar', scene)).toBeUndefined();
  expect(learningExample({ ...entry, term: 'all' }, 'th', scene)).toBeUndefined();
});
