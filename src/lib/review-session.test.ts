// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { VOCABULARY_ES, VOCABULARY_TH as VOCABULARY } from '@/test-fixtures/legacy-vocabulary';
import type { VocabEntry } from '@/data/vocab-types';
import { FIXTURE_CATALOG, FIXTURE_GERMAN, fixtureEntry } from '@/test-fixtures/fixture-catalog';
import { setCurrentCatalog } from './content/catalog-state';

import { DAY_MS, NEW_CARDS_PER_SESSION, retrievability } from './fsrs/fsrs';
import { loadCardStatesForDirection, rateCard } from './repository';
import {
  buildReviewQueue,
  DIRECTIONS,
  ensureCardStates,
  summarizeAllDirections,
  summarizeDirection,
} from './review-session';
import { DataStore, MemoryDataStore } from './storage';

const T0 = Date.UTC(2026, 5, 1);

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

describe('ensureCardStates', () => {
  it('legt beim ersten Aufruf zu jeder Vokabel eine Karte an', async () => {
    const store = await freshStore();
    const { entries, cards } = await ensureCardStates('de_to_th', store, T0);

    expect(entries).toHaveLength(VOCABULARY.length);
    expect(cards).toHaveLength(VOCABULARY.length);
    cards.forEach((card) => {
      expect(card.direction).toBe('de_to_th');
      expect(card.state).toBe('new');
    });
  });

  it('arbeitet auch mit leerem Vokabelspeicher — der Wortschatz kommt aus dem Katalog', async () => {
    const store = await freshStore();
    expect(await store.getAll('vocab')).toHaveLength(0);

    const { entries, cards } = await ensureCardStates('de_to_th', store, T0);
    expect(entries).toHaveLength(VOCABULARY.length);
    expect(await store.getAll('cards')).toHaveLength(cards.length);
  });

  it('legt beim zweiten Aufruf nichts Neues an', async () => {
    const store = await freshStore();
    await ensureCardStates('de_to_th', store, T0);
    const afterFirst = await loadCardStatesForDirection('de_to_th', store);

    await ensureCardStates('de_to_th', store, T0 + DAY_MS);
    const afterSecond = await loadCardStatesForDirection('de_to_th', store);

    expect(afterSecond).toHaveLength(afterFirst.length);
  });

  it('haelt die Lernsprachen strikt auseinander: de_to_th ist Thai, th_to_de ist Deutsch', async () => {
    const store = await freshStore();
    await ensureCardStates('th_to_de', store, T0);
    await ensureCardStates('de_to_th', store, T0);

    expect(await loadCardStatesForDirection('de_to_th', store)).toHaveLength(VOCABULARY.length);
    expect(await loadCardStatesForDirection('th_to_de', store)).toHaveLength(FIXTURE_GERMAN.length);
    expect(await store.getAll('cards')).toHaveLength(VOCABULARY.length + FIXTURE_GERMAN.length);
  });
});

describe('buildReviewQueue', () => {
  it('deckelt neue Karten am Anfang auf NEW_CARDS_PER_SESSION', async () => {
    // Neue Karten sind zwar alle sofort faellig - aber eine Sitzung nimmt nur
    // NEW_CARDS_PER_SESSION von ihnen auf, sonst flutet der Grundstock jede
    // Sitzung und die faellig wiederholten Karten verhungern dahinter.
    const store = await freshStore();
    const queue = await buildReviewQueue('de_to_th', store, T0);
    expect(queue).toHaveLength(NEW_CARDS_PER_SESSION);
    expect(queue.every((item) => item.card.state === 'new')).toBe(true);
  });

  it('zieht für ein Kapitel nur dessen Wörter, auch wenn sie nicht am Anfang des Grundstocks stehen', async () => {
    const store = await freshStore();
    const ids = new Set(VOCABULARY.slice(35, 55).map((entry) => entry.id));
    const queue = await buildReviewQueue('de_to_th', store, T0, ids);
    expect(queue).toHaveLength(20);
    expect(new Set(queue.map((item) => item.entry.id))).toEqual(ids);
  });

  it('verbindet jede Karte mit ihrem Vokabeleintrag', async () => {
    const store = await freshStore();
    const queue = await buildReviewQueue('de_to_th', store, T0);
    queue.forEach((item) => {
      expect(item.entry.id).toBe(item.card.vocabId);
      expect(item.card.direction).toBe('de_to_th');
    });
  });

  it('stellt bewertete Karten vor neue und sortiert sie nach Retrievability', async () => {
    const store = await freshStore();
    await ensureCardStates('de_to_th', store, T0);

    // Drei Karten unterschiedlich stark bewerten, danach zehn Tage warten.
    const cards = await loadCardStatesForDirection('de_to_th', store);
    const byId = new Map(cards.map((card) => [card.vocabId, card]));
    await rateCard(byId.get('gai')!, 4, store, T0);
    await rateCard(byId.get('khai')!, 3, store, T0);
    await rateCard(byId.get('dii')!, 2, store, T0);

    const later = T0 + 10 * DAY_MS;
    const queue = await buildReviewQueue('de_to_th', store, later);

    // Bereits gelernte Karten zuerst, darunter am ehesten Vergessenes -
    // aufsteigende Retrievability. Die (nur bis zum Deckel aufgefuellten)
    // neuen Karten stehen HINTER ihnen, nicht mehr wie frueher ganz vorn.
    const reviewed = queue.filter((item) => item.card.state !== 'new');
    const values = reviewed.map((item) => retrievability(item.card, later));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(reviewed).toHaveLength(3);
    expect(retrievability(reviewed[0].card, later)).toBeLessThan(1);

    const fresh = queue.slice(reviewed.length);
    expect(fresh).toHaveLength(NEW_CARDS_PER_SESSION);
    expect(fresh.every((item) => item.card.state === 'new')).toBe(true);
  });

  it('laesst noch nicht faellige Karten weg', async () => {
    const store = await freshStore();
    await ensureCardStates('de_to_th', store, T0);

    const cards = await loadCardStatesForDirection('de_to_th', store);
    // Alles auf "Leicht" - danach ist nichts mehr sofort faellig.
    for (const card of cards) {
      await rateCard(card, 4, store, T0);
    }

    expect(await buildReviewQueue('de_to_th', store, T0)).toHaveLength(0);
  });

  it('bewertet nur die gewaehlte Richtung, die andere bleibt unberuehrt', async () => {
    const store = await freshStore();
    await ensureCardStates('en_to_th', store, T0);
    await ensureCardStates('de_to_th', store, T0);

    const cards = await loadCardStatesForDirection('de_to_th', store);
    for (const card of cards) {
      await rateCard(card, 4, store, T0);
    }

    expect(await buildReviewQueue('de_to_th', store, T0)).toHaveLength(0);
    // Dieselben Thai-Wörter auf englischer Oberfläche haben eigene Karten.
    expect(await buildReviewQueue('en_to_th', store, T0)).toHaveLength(NEW_CARDS_PER_SESSION);
  });
});

// SPRACH-UMBAU 23.09.2026: EIN Weg für jede Richtung. Kartenstoff ist der
// Wortschatz der ZIELsprache, die Vorderseite die Übersetzung in der
// Ankersprache (`translations[anker]`) — für alle 20 App-Sprachen gleich.
describe('buildReviewQueue für jede App-Sprache', () => {
  afterEach(() => setCurrentCatalog(FIXTURE_CATALOG));

  it('nimmt auf jeder Oberfläche den ganzen Wortschatz der Zielsprache', async () => {
    const store = await freshStore();
    for (const direction of ['de_to_es', 'en_to_es', 'ar_to_es'] as const) {
      const { entries } = await ensureCardStates(direction, store, T0);
      expect(entries).toHaveLength(VOCABULARY_ES.length);
      expect(entries.every((entry) => entry.language === 'es')).toBe(true);
    }
  });

  it('hält die Karten verschiedener Oberflächen getrennt', async () => {
    const store = await freshStore();
    await ensureCardStates('en_to_es', store, T0);
    await ensureCardStates('de_to_es', store, T0);
    const en = await loadCardStatesForDirection('en_to_es', store);
    expect(en).toHaveLength(VOCABULARY_ES.length);
    en.forEach((card) => expect(card.direction).toBe('en_to_es'));
  });

  it('zeigt vorn das Wort der Ankersprache, wenn es übersetzt ist — sonst nichts Erfundenes', async () => {
    const hola: VocabEntry = {
      ...VOCABULARY_ES[0],
      id: 'ki-es-hola',
      translations: { ar: 'مرحبا', en: 'hello' },
    };
    setCurrentCatalog({ ...FIXTURE_CATALOG, entries: [fixtureEntry(hola)] });
    const store = await freshStore();

    const [ar] = await buildReviewQueue('ar_to_es', store, T0);
    expect(ar.bridgeEntry).toEqual({ id: 'ki-es-hola:ar', concept: VOCABULARY_ES[0].concept ?? 'ki-es-hola', term: 'مرحبا' });

    const [tr] = await buildReviewQueue('tr_to_es', store, T0);
    expect(tr.bridgeEntry).toBeNull();
  });

  it('Deutsch als Ziel: deutsche Wörter, Vorderseite in der Ankersprache', async () => {
    const store = await freshStore();
    const queue = await buildReviewQueue('th_to_de', store, T0);
    expect(queue).toHaveLength(NEW_CARDS_PER_SESSION);
    queue.forEach((item) => {
      expect(item.entry.language).toBe('de');
      // Der deutsche Eintrag liest seine Zielform selbst (german = term).
      expect(item.entry.german).toBe(item.entry.term);
      expect(item.bridgeEntry!.term).toMatch(/\p{Script=Thai}/u);
    });
  });
});

describe('summarizeDirection', () => {
  it('zaehlt zu Beginn alles als neu, die Faelligkeit bis zum Sitzungsdeckel', async () => {
    const store = await freshStore();
    const summary = await summarizeDirection('de_to_th', store, T0);

    expect(summary.direction).toBe('de_to_th');
    expect(summary.total).toBe(VOCABULARY.length);
    // `due` folgt der Sitzungenzusammenstellung: neue Karten zaehlen nur bis
    // zum Deckel - sonst verspraeche die Zahl eine Sitzung, die es so nicht gibt.
    expect(summary.due).toBe(NEW_CARDS_PER_SESSION);
    expect(summary.fresh).toBe(VOCABULARY.length);
    expect(summary.mastered).toBe(0);
  });

  it('nimmt bewertete Karten aus der Faelligkeit heraus', async () => {
    const store = await freshStore();
    await ensureCardStates('de_to_th', store, T0);
    const cards = await loadCardStatesForDirection('de_to_th', store);
    // So viele Karten bewerten, dass die Zahl der verbliebenen UNTER dem
    // Deckel liegt - nur dann zeigt die Faelligkeitszahl sichtbar, dass
    // bewertete Karten rausgenommen sind (ueber dem Deckel kaeme die Zahl
    // nicht herunter, egal wie viele bewertet waeren).
    const bewertet = VOCABULARY.length - (NEW_CARDS_PER_SESSION - 1);
    for (const card of cards.slice(0, bewertet)) {
      await rateCard(card, 4, store, T0);
    }

    const summary = await summarizeDirection('de_to_th', store, T0);
    expect(summary.due).toBe(NEW_CARDS_PER_SESSION - 1);
    expect(summary.fresh).toBe(NEW_CARDS_PER_SESSION - 1);
  });

  it('fasst eine Sprache über ihre Inhalts-Richtung zusammen', async () => {
    const store = await freshStore();
    const summaries = await summarizeAllDirections('th', store, T0);

    expect(summaries.map((s) => s.direction)).toEqual([...DIRECTIONS]);
    expect(summaries[0].total).toBe(VOCABULARY.length);
    const deutsch = await summarizeAllDirections('de', store, T0);
    expect(deutsch.map((s) => s.direction)).toEqual(['th_to_de']);
    expect(deutsch[0].total).toBe(FIXTURE_GERMAN.length);
  });
});
