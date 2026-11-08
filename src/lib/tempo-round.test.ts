import type { VocabEntry } from '@/data/vocab-types';

import type { CardState, FSRSCardState } from './fsrs/types';
import { MemoryDataStore } from './storage';
import { loadTempoBest, saveTempoBest, tempoItems, tempoWords } from './tempo-round';

function word(id: string, term: string, german: string, language = 'en'): VocabEntry {
  return {
    id, term, german, language: language as VocabEntry['language'], romanization: term, partOfSpeech: 'noun',
    register: 'neutral', isConcrete: true, sourceVerified: false, syllables: [], generatedAt: 1,
  };
}

function card(vocabId: string, state: CardState, direction: FSRSCardState['direction'] = 'de_to_en'): FSRSCardState {
  return { vocabId, direction, state, difficulty: 5, stability: 10, due: 0, lastReview: 0, reps: 3, lapses: 0 };
}

const WORDS = [
  word('w1', 'apple', 'Apfel'), word('w2', 'bread', 'Brot'), word('w3', 'water', 'Wasser'),
  word('w4', 'milk', 'Milch'), word('w5', 'tea', 'Tee'), word('w6', 'rice', 'Reis'),
  // Gleiche Bedeutung wie w1: gäbe zwei richtige Antworten.
  word('w7', 'apples', 'Apfel'),
  // Andere Lernsprache.
  word('x1', 'manzana', 'Apfel', 'es'),
];

test('nur sichere Wörter der Lernsprache, je Bedeutung eines', () => {
  const cards = [
    card('w1', 'review'), card('w2', 'mastered'), card('w3', 'learning'), card('w4', 'new'),
    card('w5', 'review', 'en_to_de'), card('w7', 'review'), card('x1', 'review'),
  ];
  const words = tempoWords(WORDS, cards, new Set(['w6']), 'de_to_en');
  expect(words.map((entry) => entry.entry.id)).toEqual(['w1', 'w2', 'w6']);
  expect(words.map((entry) => entry.meaning)).toEqual(['Apfel', 'Brot', 'Reis']);
});

test('jede Aufgabe hat genau eine richtige Antwort und kein Wort kommt zweimal direkt hintereinander', () => {
  const words = tempoWords(WORDS.slice(0, 6), [], new Set(WORDS.map((entry) => entry.id)), 'de_to_en');
  const items = tempoItems(words, 'de_to_en', 11, 120);
  expect(items).toHaveLength(120);
  const meaningOf = new Map(words.map((entry) => [entry.entry.id, entry.meaning]));
  items.forEach((item, index) => {
    expect(item.options[item.correctIndex]).toBe(meaningOf.get(item.vocabId));
    expect(item.options[1 - item.correctIndex]).not.toBe(meaningOf.get(item.vocabId));
    if (index > 0) expect(item.vocabId).not.toBe(items[index - 1].vocabId);
  });
  // Gleiche Aussaat, gleiche Runde.
  expect(tempoItems(words, 'de_to_en', 11, 120)).toEqual(items);
  expect(tempoItems(words.slice(0, 1), 'de_to_en', 11)).toEqual([]);
});

test('der Bestwert steigt nur', async () => {
  const store = new MemoryDataStore();
  await store.init();
  expect(await loadTempoBest('de_to_en', store)).toBe(0);
  expect(await saveTempoBest('de_to_en', 12, store)).toBe(12);
  expect(await saveTempoBest('de_to_en', 9, store)).toBe(12);
  expect(await loadTempoBest('de_to_en', store)).toBe(12);
  expect(await loadTempoBest('en_to_de', store)).toBe(0);
});
