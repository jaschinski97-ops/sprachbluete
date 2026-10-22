import { createCardState } from './fsrs/fsrs';
import { cardKey } from './fsrs/types';
import { MemoryDataStore } from './storage';
import {
  isValidWordPractice,
  loadPracticeContext,
  loadWordPractice,
  recordWordPractice,
} from './word-practice';

const T0 = Date.UTC(2026, 9, 22, 10);

async function freshStore() {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

describe('Übungsgedächtnis je Wort', () => {
  it('zählt Antworten und Serien richtiger Antworten', async () => {
    const store = await freshStore();
    await recordWordPractice('hallo', true, T0, store);
    await recordWordPractice('hallo', true, T0 + 1, store);
    let entry = (await loadWordPractice(store)).get('hallo')!;
    expect(entry).toMatchObject({ total: 2, correct: 2, streak: 2, lastAt: T0 + 1, lastCorrect: true });

    await recordWordPractice('hallo', false, T0 + 2, store);
    entry = (await loadWordPractice(store)).get('hallo')!;
    expect(entry).toMatchObject({ total: 3, correct: 2, streak: 0, lastCorrect: false });
  });

  it('verliert bei gleichzeitigen Antworten keine', async () => {
    const store = await freshStore();
    await Promise.all([1, 2, 3, 4].map((i) => recordWordPractice('wasser', true, T0 + i, store)));
    expect((await loadWordPractice(store)).get('wasser')!.total).toBe(4);
  });

  it('legt beim Lesen keine Karten an und liest nur die eigene Richtung', async () => {
    const store = await freshStore();
    await store.put('cards', cardKey('a', 'de_to_th'), createCardState('a', 'de_to_th', T0));
    await store.put('cards', cardKey('b', 'en_to_th'), createCardState('b', 'en_to_th', T0));
    const context = await loadPracticeContext('de_to_th', store, T0);
    expect([...context.cards.keys()]).toEqual(['a']);
    expect(await store.getAll('cards')).toHaveLength(2);
  });

  it('erkennt kaputte Einträge', () => {
    expect(isValidWordPractice({ vocabId: 'x', total: 1, correct: 1, streak: 1, lastAt: T0, lastCorrect: true })).toBe(true);
    expect(isValidWordPractice({ vocabId: '', total: 1, correct: 1, streak: 1, lastAt: T0, lastCorrect: true })).toBe(false);
    expect(isValidWordPractice({ vocabId: 'x', total: -1, correct: 1, streak: 1, lastAt: T0, lastCorrect: true })).toBe(false);
    expect(isValidWordPractice({ vocabId: 'x', total: 1, correct: 1, streak: 1, lastAt: T0 })).toBe(false);
    expect(isValidWordPractice(null)).toBe(false);
  });
});
