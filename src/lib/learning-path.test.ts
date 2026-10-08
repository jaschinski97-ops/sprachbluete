import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';

import type { ConversationSituation } from './conversation/types';
import { chaptersForDirection, finishChapter, finishedChapterIds } from './learning-path';
import { MemoryDataStore } from './storage';
import type { VocabEntry } from '@/data/vocab-types';

test('a late catalog noun in plural is retained before the 20-word limit even after many function words', () => {
  const words: VocabEntry[] = Array.from({ length: 21 }, (_, index) => ({
    id: `f${index}`, term: `f${index}`, language: 'en', romanization: `f${index}`, german: `Funktion ${index}`,
    partOfSpeech: 'particle', register: 'neutral', isConcrete: false, sourceVerified: false, syllables: [], generatedAt: 1,
  }));
  const apple: VocabEntry = { ...words[0], id: 'apple', term: 'apple', german: 'Apfel', partOfSpeech: 'noun', isConcrete: true, generatedAt: 2 };
  words.push(apple);
  const market = { ...scene('market', 'market', 'A1'), direction: 'de_to_en' as const,
    scriptTurns: [{ speaker: 'learner' as const, thai: `${words.slice(0, 21).map(word => word.term).join(' ')} apples`, roman: '', german: '' }] };
  const chapter = chaptersForDirection('de_to_en', [market], words)[0];
  expect(chapter.vocabulary).toHaveLength(20);
  expect(chapter.vocabulary[0]).toEqual(apple);
});

function scene(id: string, topic: ConversationSituation['topic'], level: ConversationSituation['level']): ConversationSituation {
  return {
    id, topic, level, direction: 'de_to_th', title: id, setting: '',
    scriptTurns: [{ speaker: 'learner', thai: 'ผมชอบกาแฟ', roman: '', german: 'Ich mag Kaffee.' }],
    corrections: [], generatedAt: 1, modelUsed: 'test',
  };
}

test('Kapitel nutzen nur Dialogwörter und füllen nicht mit fremdem Wortschatz auf', () => {
  const chapters = chaptersForDirection('de_to_th', [
    scene('restaurant-A2', 'restaurant', 'A2'),
    scene('market-A1', 'market', 'A1'),
    scene('greeting-A1', 'greeting', 'A1'),
    { ...scene('other', 'greeting', 'A1'), direction: 'de_to_en' },
  ], VOCABULARY_TH);

  expect(chapters.map((chapter) => chapter.id)).toEqual(['greeting-A1', 'market-A1', 'restaurant-A2']);
  expect(chapters.every((chapter) => chapter.vocabulary.length > 0 && chapter.vocabulary.length <= 20)).toBe(true);
  expect(chapters.every((chapter) => new Set(chapter.vocabulary.map((word) => word.id)).size === chapter.vocabulary.length)).toBe(true);
  expect(chapters.every(chapter => chapter.vocabulary.every(word => chapter.situation.scriptTurns[0].thai.includes(word.term)))).toBe(true);
  expect(chapters[0].vocabulary.map((word) => word.id)).toEqual(chapters[1].vocabulary.map((word) => word.id));
});

test('Kapitelabschluss bleibt pro Lernrichtung und Dialog lokal gespeichert', async () => {
  const store = new MemoryDataStore();
  await store.init();
  const chapters = chaptersForDirection('de_to_th', [scene('greeting-A1', 'greeting', 'A1')], VOCABULARY_TH);
  expect(await finishedChapterIds('de_to_th', chapters, store)).toEqual([]);
  await finishChapter('de_to_th', chapters[0].id, store);
  expect(await finishedChapterIds('de_to_th', chapters, store)).toEqual([chapters[0].id]);
  expect(await finishedChapterIds('th_to_de', chapters, store)).toEqual([]);
});
