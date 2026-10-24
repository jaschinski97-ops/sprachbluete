import { loadAllCardStates, seedVocabulary } from './repository';
import { loadReviewLog } from './review-log';
import { MemoryDataStore } from './storage';
import {
  buildWordList,
  checkWordListAnswer,
  compareMeaning,
  meaningTargets,
  ratingForAnswer,
  saveWordListAnswers,
  selectWordListWords,
  WORD_LIST_SIZE,
} from './word-list';

const T0 = Date.UTC(2026, 9, 24, 8);
const DAY = 24 * 60 * 60 * 1000;

async function freshStore() {
  const store = new MemoryDataStore();
  await store.init();
  await seedVocabulary(store);
  return store;
}

describe('Bedeutung prüfen', () => {
  it('nimmt jede Bedeutung einer Aufzählung', () => {
    expect(meaningTargets('setengah, separuh')).toEqual(['setengah, separuh', 'setengah', 'separuh']);
    expect(compareMeaning('separuh', 'setengah, separuh', 'id')).toEqual({ correct: true, exact: true });
  });

  it('übersieht Großschreibung, Artikel und Klammern', () => {
    expect(compareMeaning('haus', 'das Haus', 'de').exact).toBe(true);
    expect(compareMeaning('Haus', 'Haus', 'de').exact).toBe(true);
    expect(compareMeaning('eat', 'to eat', 'en').exact).toBe(true);
    expect(compareMeaning('ich', 'ich (männlicher Sprecher)', 'de').exact).toBe(true);
  });

  it('zählt fehlende Akzente und kleine Vertipper als richtig, nicht genau', () => {
    expect(compareMeaning('mot nua', 'một nửa', 'vi')).toEqual({ correct: true, exact: false });
    expect(compareMeaning('Halfte', 'Hälfte', 'de')).toEqual({ correct: true, exact: false });
    expect(compareMeaning('Fruehstuck', 'Frühstück', 'de').correct).toBe(true);
  });

  it('lässt kurze Wörter und Zeichenschriften ohne Toleranz', () => {
    expect(compareMeaning('Hut', 'Hund', 'de').correct).toBe(false);
    expect(compareMeaning('苹', '苹果', 'zh').correct).toBe(false);
    expect(compareMeaning('', 'Apfel', 'de').correct).toBe(false);
    expect(compareMeaning('Birne', 'Apfel', 'de').correct).toBe(false);
  });
});

describe('Auswahl der nächsten 20', () => {
  const words = Array.from({ length: 30 }, (_, index) => `w${index}`);
  const card = (vocabId: string, lastReview: number, stability: number) => ({
    vocabId,
    direction: 'de_to_th' as const,
    due: lastReview + stability * DAY,
    stability,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2 as const,
    lastReview,
  });

  it('nimmt neue Wörter in Häufigkeitsreihenfolge', () => {
    const chosen = selectWordListWords(words, { idOf: (id) => id, cards: new Map(), now: T0, size: 20 });
    expect(chosen).toEqual(words.slice(0, 20));
  });

  it('stellt wacklige Wörter vor neue und sichere ans Ende', () => {
    const cards = new Map([
      ['w0', card('w0', T0 - DAY, 30)],
      ['w25', card('w25', T0 - 20 * DAY, 1)],
    ]);
    const chosen = selectWordListWords(words, { idOf: (id) => id, cards: cards as never, now: T0, size: 30 });
    expect(chosen[0]).toBe('w25');
    expect(chosen[chosen.length - 1]).toBe('w0');
  });
});

describe('Wortliste mit Karten', () => {
  it('stellt 20 verschiedene Wörter mit Bedeutung zusammen', async () => {
    const store = await freshStore();
    const list = await buildWordList({ direction: 'de_to_th', store, now: T0, seed: 1 });
    expect(list.items).toHaveLength(WORD_LIST_SIZE);
    expect(new Set(list.items.map((item) => item.vocabId)).size).toBe(WORD_LIST_SIZE);
    for (const item of list.items) {
      expect(item.word.trim()).not.toBe('');
      expect(item.meaning.trim()).not.toBe('');
    }
  });

  it('bewertet wie beschrieben und schreibt die Karte fort', async () => {
    const store = await freshStore();
    const list = await buildWordList({ direction: 'de_to_th', store, now: T0, seed: 1 });
    const [first, second] = list.items;
    const right = checkWordListAnswer(first, 'meaning', first.meaning);
    const wrong = checkWordListAnswer(second, 'meaning', 'xyz');
    expect(right.correct).toBe(true);
    expect(ratingForAnswer(right, 'meaning')).toBe(2);
    expect(ratingForAnswer(wrong, 'meaning')).toBe(1);
    expect(ratingForAnswer({ ...wrong, accepted: true }, 'meaning')).toBe(2);

    const written = checkWordListAnswer(first, 'word', first.writing.targets[0]);
    expect(written.exact).toBe(true);
    expect(ratingForAnswer(written, 'word')).toBe(3);

    await saveWordListAnswers([right, wrong], 'meaning', { store, now: T0 });
    const cards = await loadAllCardStates(store);
    expect(cards.find((item) => item.vocabId === first.vocabId)?.lastReview).toBe(T0);
    expect(cards.find((item) => item.vocabId === second.vocabId)?.lapses ?? 0).toBeGreaterThanOrEqual(0);
    const log = await loadReviewLog(store);
    expect(log.reduce((sum, day) => sum + day.total, 0)).toBe(2);
  });

  it('holt ein falsches Wort in der nächsten Liste wieder nach vorn', async () => {
    const store = await freshStore();
    const list = await buildWordList({ direction: 'de_to_th', store, now: T0, seed: 1 });
    const answers = list.items.map((item, index) => checkWordListAnswer(item, 'word', index === 0 ? 'falsch' : item.writing.targets[0]));
    await saveWordListAnswers(answers, 'word', { store, now: T0 });
    const next = await buildWordList({ direction: 'de_to_th', store, now: T0 + 60 * 60 * 1000, seed: 2 });
    const ids = next.items.map((item) => item.vocabId);
    expect(ids).toContain(list.items[0].vocabId);
    // Die richtig geschriebenen kommen nicht sofort wieder.
    expect(ids.filter((id) => list.items.slice(1).some((item) => item.vocabId === id))).toHaveLength(0);
  });
});
