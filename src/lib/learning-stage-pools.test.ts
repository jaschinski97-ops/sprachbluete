/**
 * Die Stufe eines Wortes wirkt im ganzen Lern-Reiter (18.10.2026): Neue
 * Karten und freie Übungen kommen nur aus der gewählten Stufe, fällige
 * Wiederholungen bleiben stufenübergreifend fällig. Grundlage ist der feste
 * Testkatalog; einige Thai-Wörter tragen darin Profi bzw. Fortgeschritten.
 */
import { satzwortschatz, SENTENCE_TASKS_BY_LANGUAGE } from '@/data/sentence-tasks';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { FIXTURE_CATALOG, fixtureCatalogWithStages } from '@/test-fixtures/fixture-catalog';

import { setCurrentCatalog } from './content/catalog-state';
import { buildDictationSession } from './dictation/tasks';
import { buildDrillSession } from './drills/session';
import { DAY_MS, NEW_CARDS_PER_SESSION } from './fsrs/fsrs';
import { pickedStage, pickStage } from './learning-path';
import { inStage, stageOfEntry, type LearningStage } from './learning-stages';
import { produktionsAufgaben } from './production/tasks';
import { loadCardStatesForDirection, rateCard, writeMeta } from './repository';
import { buildReviewQueue, ensureCardStates } from './review-session';
import { sentenceSession } from './speaking/sentence-session';
import { buildSpeakingSession } from './speaking/session';
import { buildWordSpeakingSession } from './speaking/word-session';
import { DataStore, MemoryDataStore } from './storage';
import { buildTodayRound } from './today-round';
import { buildWritingSession } from './writing/session';

const T0 = Date.UTC(2026, 9, 18);

// Neue Karten kommen in Erzeugungsreihenfolge (ohne Zeitstempel: nach ID).
// Die ersten 25 sind Profi — ohne Stufenfilter landeten sie also vorn im
// Anfänger-Stapel, genau der Fehler, den der Filter verhindert.
const SORTED_TH = [...VOCABULARY_TH].sort((a, b) => a.id.localeCompare(b.id));
const PRO = new Set(SORTED_TH.slice(0, 25).map((entry) => entry.id));
const EXPERIENCED = new Set(SORTED_TH.slice(25, 30).map((entry) => entry.id));
const STAGES: Record<string, LearningStage> = Object.fromEntries([
  ...[...PRO].map((id) => [id, 'pro'] as const),
  ...[...EXPERIENCED].map((id) => [id, 'experienced'] as const),
]);
const isBeginner = (id: string) => !PRO.has(id) && !EXPERIENCED.has(id);

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

beforeEach(() => setCurrentCatalog(fixtureCatalogWithStages(STAGES)));
afterAll(() => setCurrentCatalog(FIXTURE_CATALOG));

describe('Stufe eines Wortes', () => {
  it('gilt ohne Feld als Anfänger, und ohne Stufe bleibt ein Pool unverändert', () => {
    expect(stageOfEntry({})).toBe('beginner');
    expect(stageOfEntry({ learningStage: 'pro' })).toBe('pro');
    const pool = [{ id: 'a' }, { id: 'b', learningStage: 'pro' as const }];
    expect(inStage(pool, 'beginner').map((entry) => entry.id)).toEqual(['a']);
    expect(inStage(pool, 'pro').map((entry) => entry.id)).toEqual(['b']);
    expect(inStage(pool)).toEqual(pool);
  });
});

describe('Karteikarten je Stufe', () => {
  it('ohne Stufe wie bisher: die Profi-Wörter stünden vorn', async () => {
    const queue = await buildReviewQueue('de_to_th', await freshStore(), T0);
    expect(queue).toHaveLength(NEW_CARDS_PER_SESSION);
    expect(queue.every((item) => PRO.has(item.entry.id))).toBe(true);
  });

  it('Anfänger bekommen nur Anfängerwörter als neue Karten', async () => {
    const queue = await buildReviewQueue('de_to_th', await freshStore(), T0, undefined, 'beginner');
    expect(queue).toHaveLength(NEW_CARDS_PER_SESSION);
    expect(queue.every((item) => item.card.state === 'new' && isBeginner(item.entry.id))).toBe(true);
    // Dieselbe Reihenfolge wie bisher, nur ohne die anderen Stufen.
    const erwartet = SORTED_TH.filter((entry) => isBeginner(entry.id)).slice(0, NEW_CARDS_PER_SESSION);
    expect(queue.map((item) => item.entry.id)).toEqual(erwartet.map((entry) => entry.id));
  });

  it('Profi und Fortgeschritten bekommen nur ihre eigenen neuen Karten', async () => {
    const store = await freshStore();
    const pro = await buildReviewQueue('de_to_th', store, T0, undefined, 'pro');
    expect(pro).toHaveLength(NEW_CARDS_PER_SESSION);
    expect(pro.every((item) => PRO.has(item.entry.id))).toBe(true);
    const experienced = await buildReviewQueue('de_to_th', store, T0, undefined, 'experienced');
    expect(experienced.map((item) => item.entry.id).sort()).toEqual([...EXPERIENCED].sort());
  });

  it('fällige Wiederholungen bleiben stufenübergreifend fällig — Gelerntes verschwindet nicht', async () => {
    const store = await freshStore();
    await ensureCardStates('de_to_th', store, T0);
    const cards = await loadCardStatesForDirection('de_to_th', store);
    const proCard = cards.find((card) => PRO.has(card.vocabId))!;
    await rateCard(proCard, 3, store, T0);

    const queue = await buildReviewQueue('de_to_th', store, T0 + 30 * DAY_MS, undefined, 'beginner');
    expect(queue[0].entry.id).toBe(proCard.vocabId);
    expect(queue[0].card.state).not.toBe('new');
    expect(queue.slice(1).every((item) => item.card.state === 'new' && isBeginner(item.entry.id))).toBe(true);
  });

  it('ein Kapitel übt seine Wörter, gleich welcher Stufe (ohne Stufe übergeben)', async () => {
    const ids = new Set([...PRO].slice(0, 3).concat(SORTED_TH.slice(40, 43).map((entry) => entry.id)));
    const queue = await buildReviewQueue('de_to_th', await freshStore(), T0, ids);
    expect(new Set(queue.map((item) => item.entry.id))).toEqual(ids);
  });

  it('die Heutige Runde nimmt neue Karten nur aus der gewählten Stufe', async () => {
    const round = await buildTodayRound('de_to_th', await freshStore(), T0, 'pro');
    expect(round.due.length).toBeGreaterThan(0);
    expect(round.due.every((item) => PRO.has(item.entry.id))).toBe(true);
    const beginner = await buildTodayRound('de_to_th', await freshStore(), T0, 'beginner');
    expect(beginner.due.every((item) => isBeginner(item.entry.id))).toBe(true);
  });
});

describe('freie Übungen je Stufe', () => {
  it('Auswahlübungen ziehen nur Wörter der Stufe', async () => {
    const store = await freshStore();
    const pro = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 3, stage: 'pro' });
    expect(pro.questions.length).toBeGreaterThan(0);
    expect(pro.questions.every((question) => PRO.has(question.vocabId))).toBe(true);
    const beginner = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 3, stage: 'beginner' });
    expect(beginner.questions.every((question) => isBeginner(question.vocabId))).toBe(true);
  });

  it('Schreiben nimmt ohne eigene Wortliste nur Wörter der Stufe', async () => {
    const session = await buildWritingSession({ direction: 'de_to_th', store: await freshStore(), now: T0, seed: 1, stage: 'pro' });
    expect(session.prompts.length).toBeGreaterThan(0);
    expect(session.prompts.every((prompt) => PRO.has(prompt.vocabId))).toBe(true);
    expect(session.available).toBeLessThanOrEqual(PRO.size);
  });

  it('Sprechen und „Sag es“ ziehen nur Wörter der Stufe', async () => {
    const store = await freshStore();
    const words = await buildWordSpeakingSession({ direction: 'de_to_th', store, now: T0, seed: 2, stage: 'pro' });
    expect(words.tasks.length).toBeGreaterThan(0);
    expect(words.tasks.every((task) => PRO.has(task.id))).toBe(true);

    const contour = await buildSpeakingSession({ store, now: T0, seed: 2, stage: 'pro' });
    expect(contour.prompts.length).toBeGreaterThan(0);
    expect(contour.prompts.every((prompt) => PRO.has(prompt.vocabId))).toBe(true);

    const aufgaben = await produktionsAufgaben({ direction: 'de_to_th', store, seed: 7, stage: 'pro' });
    expect(aufgaben.length).toBeGreaterThan(0);
    expect(aufgaben.every((aufgabe) => PRO.has(aufgabe.vocabId))).toBe(true);
  });

  it('Satz verstehen und Diktat nehmen den Satzwortschatz der Stufe', () => {
    // Jeder Satz der Stufe genau einmal (doppelte Satztexte: das häufigere Wort gewinnt).
    const pro = satzwortschatz('th', 'pro');
    expect(pro.every((entry) => PRO.has(entry.id))).toBe(true);
    expect(new Set(pro.map((entry) => entry.exampleTerm))).toEqual(
      new Set(VOCABULARY_TH.filter((entry) => PRO.has(entry.id) && entry.exampleTerm).map((entry) => entry.exampleTerm)));
    expect(satzwortschatz('th', 'beginner').every((entry) => isBeginner(entry.id))).toBe(true);
    // Ohne Stufe: alle Thai-Sätze, ohne feste Obergrenze (24.10.2026).
    expect(satzwortschatz('th')).toHaveLength(SENTENCE_TASKS_BY_LANGUAGE.th.length);

    const saetze = sentenceSession('th', 1, 'de', undefined, 'pro');
    expect(saetze.length).toBeGreaterThan(0);
    expect(saetze.every((task) => PRO.has(task.vocabId))).toBe(true);

    const diktat = buildDictationSession('th', 'de_to_th', 1, undefined, 'pro');
    expect(diktat.length).toBeGreaterThan(0);
    expect(diktat.every((task) => PRO.has(task.vocabId))).toBe(true);
  });
});

describe('gewählte Stufe merken', () => {
  it('speichert je Lernsprache und verwirft unbekannte Werte', async () => {
    const store = await freshStore();
    expect(await pickedStage('th', store)).toBeNull();
    await pickStage('th', 'pro', store);
    expect(await pickedStage('th', store)).toBe('pro');
    expect(await pickedStage('en', store)).toBeNull();
    await writeMeta('learning-stage:es', 'C1', store);
    expect(await pickedStage('es', store)).toBeNull();
  });
});
