import { TONE_KEYS, TONES } from '@/constants/tones';
import { translate } from '../i18n';
// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { VOCABULARY_TH as VOCABULARY, VocabEntry } from '@/test-fixtures/legacy-vocabulary';
import { FIXTURE_GERMAN } from '@/test-fixtures/fixture-catalog';
import { contentDirectionOf, LANGUAGE_CODES } from '../languages/types';

import { createCardState } from '../fsrs/fsrs';
import { cardKey } from '../fsrs/types';
import { loadProfile, setConversationDirection, setLanguage, setReviewSpot } from '../profile';
import { dayIsActive, dayKey, drillCount, loadReviewLog, recordDrill } from '../review-log';
import { rateCard } from '../repository';
import { DataStore, MemoryDataStore } from '../storage';

import {
  bareNoun,
  buildArticleQuestion,
  buildToneQuestion,
  buildVerbFormQuestion,
  canBuildArticleQuestion,
  canBuildToneQuestion,
  canBuildVerbFormQuestion,
  swapAuxiliary,
  alternativePerfekt,
} from './questions';
import { seededRandom, shuffled } from './random';
import { buildDrillSession, DRILL_SESSION_SIZE, scoreAnswers } from './session';
import { directionForDrill, DRILL_META, DRILLS, drillsForDirection } from './types';

const T0 = Date.UTC(2026, 8, 1, 10);

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

function entryById(id: string): VocabEntry {
  const entry = VOCABULARY.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Testdaten erwarten den Eintrag "${id}".`);
  return entry;
}

const singleSyllable = () => VOCABULARY.filter(canBuildToneQuestion);
const multiSyllable = () => VOCABULARY.filter((entry) => entry.syllables.length > 1);

describe('Ton-Uebung', () => {
  it('nimmt nur einsilbige Woerter', () => {
    // Bei mehrsilbigen Woertern hat jede Silbe ihren eigenen Ton (AE-7); die
    // Frage "welchen Ton?" haette dann gar keine richtige Antwort.
    expect(singleSyllable().length).toBeGreaterThan(20);
    for (const entry of multiSyllable()) {
      expect(canBuildToneQuestion(entry)).toBe(false);
    }
  });

  it('weigert sich, eine Aufgabe zu einem mehrsilbigen Wort zu bauen', () => {
    const sawatdii = entryById('sawatdii');
    expect(sawatdii.syllables.length).toBeGreaterThan(1);
    expect(() => buildToneQuestion(sawatdii)).toThrow(/mehrsilbig/);
  });

  it('zeigt vor der Antwort weder Schrift noch Bedeutung', () => {
    // Die Thai-Schrift traegt das Tonzeichen, die Bedeutung erlaubt es, die
    // Antwort aus dem Gedaechtnis zu holen statt sie zu hoeren.
    const question = buildToneQuestion(entryById('gai'));
    expect(question.visible).toBeNull();
    expect(question.visibleHint).toBeNull();
    expect(question.speak).toEqual({ text: 'ไก่', language: 'th' });
  });

  it('bietet genau die fuenf Toene in fester Reihenfolge an', () => {
    const question = buildToneQuestion(entryById('gai'));
    expect(question.options.map((option) => option.tone)).toEqual(TONE_KEYS);
    expect(question.options.map((option) => option.label)).toEqual(
      TONE_KEYS.map((key) => TONES[key].label)
    );
  });

  it('markiert den richtigen Ton', () => {
    // ไก่ ist tief - der Referenzfall aus Phase 2, den eine Fliesstext-Quelle
    // faelschlich als "falling" fuehrte.
    const question = buildToneQuestion(entryById('gai'));
    expect(question.options[question.correctIndex].tone).toBe('low');
    // SEIT DEM 21.09.2026 Chrome-Satz mit Wörterbuch-Tonnamen (UI-Sprache).
    expect(question.explanation).toBe(translate('de', 'drill.toneIs', { tone: TONES.low.label }));
  });

  it('trifft fuer jedes einsilbige Wort den Ton aus den Daten', () => {
    for (const entry of singleSyllable()) {
      const question = buildToneQuestion(entry);
      expect(question.options[question.correctIndex].tone).toBe(entry.syllables[0].tone);
    }
  });

  it('loest erst nach der Antwort auf, was das Wort war', () => {
    const question = buildToneQuestion(entryById('nam'));
    expect(question.solution).toContain('น้ำ');
    expect(question.solution).toContain('das Wasser');
  });
});

describe('Artikel-Uebung', () => {
  it('nimmt nur Substantive', () => {
    for (const entry of VOCABULARY) {
      expect(canBuildArticleQuestion(entry)).toBe(Boolean(entry.germanNoun));
    }
  });

  it('streicht den Artikel aus dem Stichwort', () => {
    expect(bareNoun(entryById('baan'))).toBe('Haus');
    expect(bareNoun(entryById('khaao'))).toBe('Reis');
    expect(bareNoun(entryById('rongrian'))).toBe('Schule');
  });

  it('fragt bei mehreren Bedeutungen nur nach der ersten', () => {
    // "der Laden, der Verkaufsstand" - die zweite Bedeutung stuende sonst
    // mitten in der Luecke.
    expect(bareNoun(entryById('raan'))).toBe('Laden');
  });

  it('zeigt die Luecke und den thailaendischen Kontext', () => {
    // Anker Thai: das Wort selbst (mit Umschrift) ist der Kontext — die
    // Bedeutung steht auf der Rückseite (Vertrag 21.09.2026).
    const question = buildArticleQuestion(entryById('baan'), 'th');
    expect(question.visible).toBe('___ Haus');
    expect(question.visibleHint).toContain('บ้าน');
  });

  it('bietet der/die/das in fester Reihenfolge an und trifft das Genus', () => {
    for (const entry of VOCABULARY.filter(canBuildArticleQuestion)) {
      const question = buildArticleQuestion(entry);
      expect(question.options.map((option) => option.label)).toEqual(['der', 'die', 'das']);
      expect(question.options[question.correctIndex].label).toBe(entry.germanNoun!.article);
    }
  });

  it('nennt in der Erklaerung auch den Plural', () => {
    const question = buildArticleQuestion(entryById('baan'));
    expect(question.explanation).toContain('Plural: die Häuser');
  });

  it('weigert sich bei einem Wort ohne Genus-Daten', () => {
    expect(() => buildArticleQuestion(entryById('kin'))).toThrow(/kein Substantiv/);
  });
});

describe('Stammform-Uebung', () => {
  const random = () => seededRandom(7);
  const verbs = () => VOCABULARY.filter(canBuildVerbFormQuestion);

  it('nimmt nur Verben', () => {
    for (const entry of VOCABULARY) {
      expect(canBuildVerbFormQuestion(entry)).toBe(Boolean(entry.germanVerb));
    }
  });

  it('vertauscht hat und ist', () => {
    expect(swapAuxiliary('hat gegessen')).toBe('ist gegessen');
    expect(swapAuxiliary('ist gegangen')).toBe('hat gegangen');
    expect(swapAuxiliary('hat sich entschuldigt')).toBe('ist sich entschuldigt');
    expect(swapAuxiliary('gegessen')).toBeNull();
  });

  it('hat immer die Form mit vertauschtem Hilfsverb als Ablenker dabei', () => {
    // "haben" gegen "sein" ist die eigentliche Fehlerquelle. Wer nur zwischen
    // fremden Partizipien waehlen muesste, koennte die Aufgabe loesen, ohne je
    // ueber das Hilfsverb nachzudenken.
    for (const entry of verbs().filter((verb) => !alternativePerfekt(verb))) {
      const question = buildVerbFormQuestion(entry, VOCABULARY, random());
      const swapped = swapAuxiliary(entry.germanVerb!.perfekt);
      expect(question.options.map((option) => option.label)).toContain(swapped);
    }
  });

  it('bietet bei Verben mit beiden Hilfsverben die andere Form nicht als falsch an', () => {
    // „ist geritten“ und „hat geritten“ sind beide richtig (Testrunde 26.09.).
    const reiten = {
      ...verbs()[0],
      id: 'test-reiten',
      term: 'reiten',
      germanVerb: { thirdPerson: 'reitet', praeteritum: 'ritt', perfekt: 'ist geritten', irregular: true },
    } as VocabEntry;
    expect(alternativePerfekt(reiten)).toBe('hat geritten');
    for (let seed = 1; seed <= 20; seed++) {
      const question = buildVerbFormQuestion(reiten, VOCABULARY, seededRandom(seed));
      expect(question.options.map((option) => option.label)).not.toContain('hat geritten');
      expect(question.explanation).toContain('hat geritten');
    }
    expect(alternativePerfekt(verbs().find((verb) => verb.germanVerb!.perfekt === 'hat gegessen')!)).toBeNull();
  });

  it('markiert die richtige Form und wiederholt keine Antwort', () => {
    for (const entry of verbs()) {
      const question = buildVerbFormQuestion(entry, VOCABULARY, random());
      const labels = question.options.map((option) => option.label);
      expect(labels[question.correctIndex]).toBe(entry.germanVerb!.perfekt);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('erfindet keine Ablenker - jede falsche Antwort ist eine echte Form oder ein vertauschtes Hilfsverb', () => {
    const echteFormen = new Set(
      verbs().map((entry) => entry.germanVerb!.perfekt)
    );
    for (const entry of verbs()) {
      const question = buildVerbFormQuestion(entry, VOCABULARY, random());
      question.options.forEach((option, index) => {
        if (index === question.correctIndex) return;
        const istEchteForm = echteFormen.has(option.label);
        const istVertauscht = swapAuxiliary(option.label) === entry.germanVerb!.perfekt;
        expect(istEchteForm || istVertauscht).toBe(true);
      });
    }
  });

  it('nennt in der Erklaerung alle Stammformen', () => {
    const question = buildVerbFormQuestion(entryById('kin'), VOCABULARY, random());
    expect(question.explanation).toContain('isst');
    expect(question.explanation).toContain('aß');
    expect(question.explanation).toContain('hat gegessen');
    expect(question.explanation).toContain('unregelmäßig');
  });

  it('ist mit derselben Aussaat reproduzierbar', () => {
    const first = buildVerbFormQuestion(entryById('kin'), VOCABULARY, seededRandom(42));
    const second = buildVerbFormQuestion(entryById('kin'), VOCABULARY, seededRandom(42));
    expect(first.options).toEqual(second.options);
    expect(first.correctIndex).toBe(second.correctIndex);
  });
});

describe('Uebungen je Richtung', () => {
  it('ordnet jede Uebung genau ihrer Lernsprache zu', () => {
    // Seit dem Sprach-Umbau gehört jede Übung zu GENAU einer Lernsprache
    // (definitions.ts) — auch die deutschen Grammatikübungen (Sprache 'de').
    for (const drill of DRILLS) {
      const sprache = DRILL_META[drill].feature!;
      const direction = directionForDrill(drill, sprache);
      expect(drillsForDirection(direction)).toContain(drill);
      for (const andere of LANGUAGE_CODES.filter((code) => code !== sprache)) {
        expect(drillsForDirection(contentDirectionOf(andere))).not.toContain(drill);
      }
    }
  });

  it('gibt jeder Richtung mindestens eine eigene Uebung', () => {
    // Der Kern von Phase 6: beide Zielgruppen scheitern an anderen Stellen.
    expect(drillsForDirection('de_to_th').length).toBeGreaterThan(0);
    expect(drillsForDirection('th_to_de').length).toBeGreaterThan(0);
  });

  it('uebt fuer Thai-Lernende Toene und fuer Deutsch-Lernende Grammatik', () => {
    // Seit Phase 13 zweimal Ton fuer de_to_th, und das mit Absicht: „Toene
    // hoeren" trainiert das Ohr, „Ton herleiten" die Schriftregel. Beides
    // fuehrt zum selben Ton, aber ueber verschiedene Wege - wer nur hoert,
    // bleibt bei jedem neuen Wort auf das Ohr angewiesen.
    expect(drillsForDirection('de_to_th')).toEqual(['tone', 'toneRule', 'polite', 'zaehlerwort', 'konsonantenklasse']);
    expect(drillsForDirection('th_to_de')).toEqual(['article', 'verbForms', 'deutschLesen']);
  });
});

describe('buildDrillSession', () => {
  it('stellt eine Runde aus geeigneten Vokabeln zusammen', async () => {
    const store = await freshStore();
    // SEIT DEM PAARMATRIX-START OHNE FRANZÖSISCH: Die französischen Übungen
    // sind registriert, aber ihr Grundstoff ist nicht ausgeliefert
    // (`delivered: false`) — im Speicher liegen keine französischen Karten,
    // eine Sitzung wäre leer. Ihr Stoff wird in french.test.ts gegen den
    // Grundstoff in der Datei geprüft.
    for (const drill of DRILLS) {
      const session = await buildDrillSession({ drill, language: DRILL_META[drill].feature ?? 'th', store, now: T0, seed: 1 });
      // Datensatz-Kleinstuebungen (Zählwörter) haben weniger Stoff als eine
      // volle Runde — die Runde ist dann so lang wie der Datensatz.
      expect(session.questions.length).toBe(Math.min(DRILL_SESSION_SIZE, session.available));
      expect(session.available).toBeGreaterThanOrEqual(session.questions.length);
      expect(session.questions.every((question) => question.drill === drill)).toBe(true);
    }
  });

  it('vergibt keine Vokabel zweimal in derselben Runde', async () => {
    const store = await freshStore();
    const session = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 3 });
    const ids = session.questions.map((question) => question.vocabId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('beschränkt Hörfragen der Tagesrunde auf ihre Kartenwörter', async () => {
    const store = await freshStore();
    const ids = new Set(singleSyllable().slice(0, 4).map((entry) => entry.id));
    const session = await buildDrillSession({
      drill: 'tone', language: 'th', store, now: T0, seed: 3,
      onlyVocabIds: ids,
    });
    expect(session.questions.length).toBeGreaterThan(0);
    expect(session.questions.every((question) => ids.has(question.vocabId))).toBe(true);
  });

  it('legt keine eigenen Karten an und veraendert keine (AE-16)', async () => {
    const store = await freshStore();
    await buildDrillSession({ drill: 'article', language: 'de', store, now: T0, seed: 1 });

    const cards = await store.getAll<{ vocabId: string; direction: string }>('cards');
    // Genau die Vokabelkarten der Richtung (deutsche Wörter), keine zusaetzliche Sorte.
    expect(cards.every((card) => card.direction === 'th_to_de')).toBe(true);
    expect(new Set(cards.map((card) => card.vocabId)).size).toBe(cards.length);
    expect(cards).toHaveLength(FIXTURE_GERMAN.length);
  });

  it('schreibt keinen Kartenzustand zurueck', async () => {
    const store = await freshStore();
    await buildDrillSession({ drill: 'article', language: 'de', store, now: T0, seed: 1 });
    const before = await store.get('cards', cardKey('de-baan', 'th_to_de'));

    await buildDrillSession({ drill: 'article', language: 'de', store, now: T0 + 60_000, seed: 2 });
    const after = await store.get('cards', cardKey('de-baan', 'th_to_de'));

    expect(after).toEqual(before);
  });

  it('zieht nur aus den am schlechtesten sitzenden Kandidaten', async () => {
    const store = await freshStore();
    await buildDrillSession({ drill: 'article', language: 'de', store, now: T0, seed: 1 });

    // Sechs Substantive wacklig, alle uebrigen fest. Das Fenster, aus dem
    // gezogen wird, ist dreimal so gross wie die Runde - bei zwei Aufgaben
    // also genau diese sechs. Was gezogen wird, muss daraus stammen.
    const nouns = FIXTURE_GERMAN.filter((entry) => entry.germanNoun);
    const wacklig = new Set(nouns.slice(0, 6).map((entry) => entry.id));

    for (const entry of nouns) {
      const card = createCardState(entry.id, 'th_to_de', T0);
      await store.put('cards', cardKey(entry.id, 'th_to_de'), {
        ...card,
        state: 'review',
        difficulty: 5,
        stability: wacklig.has(entry.id) ? 0.2 : 5000,
        lastReview: T0 - 10 * 24 * 3600 * 1000,
        reps: 3,
      });
    }

    for (const seed of [1, 2, 3, 4, 5]) {
      const session = await buildDrillSession({
        drill: 'article',
        language: 'de',
        store,
        now: T0,
        seed,
        size: 2,
      });
      for (const question of session.questions) {
        expect(wacklig.has(question.vocabId)).toBe(true);
      }
    }
  });

  it('nimmt gelernte, wacklige Wörter vor nie gelernten (22.10.2026)', async () => {
    // Vorher zählte ein nie gelerntes Wort als „am wackligsten“: Mit den
    // wackligen Wörtern hinten im Wortschatz kam keins davon je dran.
    const store = await freshStore();
    await buildDrillSession({ drill: 'article', language: 'de', store, now: T0, seed: 1 });
    const nouns = FIXTURE_GERMAN.filter((entry) => entry.germanNoun);
    const wacklig = new Set(nouns.slice(-6).map((entry) => entry.id));
    for (const id of wacklig) {
      const card = createCardState(id, 'th_to_de', T0);
      await store.put('cards', cardKey(id, 'th_to_de'), {
        ...card,
        state: 'review',
        difficulty: 5,
        stability: 0.2,
        lastReview: T0 - 10 * 24 * 3600 * 1000,
        reps: 3,
      });
    }

    for (const seed of [1, 2, 3, 4, 5]) {
      const session = await buildDrillSession({ drill: 'article', language: 'de', store, now: T0, seed, size: 5 });
      const ausWacklig = session.questions.filter((question) => wacklig.has(question.vocabId));
      // Fünf Aufgaben: eine neue, vier wacklige.
      expect(ausWacklig).toHaveLength(4);
    }
  });

  it('liefert mit derselben Aussaat dieselbe Runde', async () => {
    const store = await freshStore();
    const a = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 11 });
    const b = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 11 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it('liefert mit anderer Aussaat eine andere Runde', async () => {
    // Sonst bekaeme man bei jedem Start dieselben zehn Aufgaben - die
    // Uebungen veraendern den Kartenzustand ja bewusst nicht.
    const store = await freshStore();
    const a = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 11 });
    const b = await buildDrillSession({ drill: 'tone', language: 'th', store, now: T0, seed: 99 });
    expect(a.questions.map((q) => q.id)).not.toEqual(b.questions.map((q) => q.id));
  });
});

describe('scoreAnswers', () => {
  it('zaehlt richtige und gesamte Antworten', () => {
    const frage = buildToneQuestion(entryById('gai'));
    expect(
      scoreAnswers([
        { question: frage, chosenIndex: frage.correctIndex, correct: true },
        { question: frage, chosenIndex: 0, correct: false },
      ])
    ).toEqual({ correct: 1, total: 2 });
  });
});

describe('Tagesprotokoll mit Uebungen', () => {
  it('zaehlt Uebungen getrennt von Wiederholungen', async () => {
    // "Wiederholungen" heisst im UI genau das. Uebungen mit hineinzuzaehlen
    // wuerde die Beschriftung zur Unwahrheit machen (AE-16).
    const store = await freshStore();
    await recordDrill(true, T0, store);
    await recordDrill(false, T0, store);
    await recordDrill(true, T0, store);

    const [day] = await loadReviewLog(store);
    expect(day.date).toBe(dayKey(T0));
    expect(day.total).toBe(0);
    expect(day.drills).toBe(3);
    expect(day.drillsCorrect).toBe(2);
  });

  it('laesst Wiederholungen und Uebungen nebeneinander stehen', async () => {
    const store = await freshStore();
    const card = createCardState('gai', 'de_to_th', T0);
    await store.put('cards', cardKey('gai', 'de_to_th'), card);
    await rateCard(card, 3, store, T0);
    await recordDrill(true, T0, store);

    const [day] = await loadReviewLog(store);
    expect(day.total).toBe(1);
    expect(drillCount(day)).toBe(1);
  });

  it('zaehlt einen Tag mit nur Uebungen als Lerntag', async () => {
    const store = await freshStore();
    await recordDrill(true, T0, store);
    const [day] = await loadReviewLog(store);
    expect(dayIsActive(day)).toBe(true);
  });

  it('vertraegt Tagesdokumente aus aelteren Versionen ohne die Felder', () => {
    const alt = {
      date: '2026-08-01',
      total: 4,
      byDirection: { de_to_th: 4, th_to_de: 0 },
      byRating: { '1': 0, '2': 0, '3': 4, '4': 0 },
    };
    expect(drillCount(alt)).toBe(0);
    expect(dayIsActive(alt)).toBe(true);
  });
});

describe('Lernprofil', () => {
  it('startet mit einer Sprache und ohne gemerkten Stand', async () => {
    // Seit Phase 15 traegt das Profil die gewaehlte Sprache (AE-42); seit
    // Phase 18 statt einer Standard-Richtung den Ort, an dem man zuletzt war.
    const store = await freshStore();
    expect(await loadProfile(store)).toEqual({ language: 'th', review: null, conversation: null });
  });

  it('merkt sich Richtung und Uebung und gibt beides wieder heraus', async () => {
    const store = await freshStore();
    await setReviewSpot({ direction: 'de_to_th', mode: 'toneRule' }, store);
    expect((await loadProfile(store)).review).toEqual({
      direction: 'de_to_th',
      mode: 'toneRule',
    });
  });

  it('vergisst den Stand auf Wunsch wieder', async () => {
    const store = await freshStore();
    await setReviewSpot({ direction: 'th_to_de', mode: 'article' }, store);
    await setReviewSpot(null, store);
    expect((await loadProfile(store)).review).toBeNull();
  });

  it('faengt bei jeder Sprachwahl von vorn an - auch bei derselben Sprache', async () => {
    // Das ist die Geste "neu anfangen" auf der Uebersicht. Wer sie macht, will
    // die Auswahl sehen und nicht dort landen, wo er gestern aufgehoert hat.
    const store = await freshStore();
    await setReviewSpot({ direction: 'de_to_th', mode: 'tone' }, store);
    await setConversationDirection('th_to_de', store);
    const danach = await setLanguage('th', store);
    expect(danach.review).toBeNull();
    expect(danach.conversation).toBeNull();
  });

  it('verwirft einen Stand, der zu einer anderen Sprache gehoert', async () => {
    // Sonst zeigte der Reiter nach einem Sprachwechsel eine Richtung, die es
    // in der neuen Sprache gar nicht gibt.
    const store = await freshStore();
    await store.put('meta', 'profile', {
      language: 'es',
      review: { direction: 'de_to_th', mode: 'tone' },
      conversation: 'th_to_de',
    });
    const profil = await loadProfile(store);
    expect(profil.language).toBe('es');
    expect(profil.review).toBeNull();
    // Die Gesprächs-Wahl ist eine eigene Wahl im Gesprächs-Reiter und bleibt
    // beim Wechsel der Karten-Lernsprache erhalten (Sprach-Umbau 23.09.2026).
    expect(profil.conversation).toBe('th_to_de');
  });

  it('ignoriert einen unsinnigen gespeicherten Wert', async () => {
    // Ein Profil aus einer aelteren Version darf die App nicht in die
    // Auswahl sperren oder gar abstuerzen lassen. `defaultDirection` aus der
    // Zeit vor Phase 18 wird schlicht nicht mehr gelesen.
    const store = await freshStore();
    await store.put('meta', 'profile', { defaultDirection: 'de_to_th', review: 'quer' });
    const profil = await loadProfile(store);
    expect(profil.review).toBeNull();
    expect(profil.language).toBe('th');
  });
});

describe('seededRandom / shuffled', () => {
  it('liefert zur selben Aussaat dieselbe Folge', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('bleibt zwischen 0 und 1', () => {
    const random = seededRandom(123);
    for (let i = 0; i < 200; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('mischt, ohne die Eingabe zu veraendern oder etwas zu verlieren', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const output = shuffled(input, seededRandom(9));
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect([...output].sort()).toEqual([...input].sort());
  });
});

describe('Deutsche Einträge: Übungen fragen das Wort, nicht die Erklärung (04.10.2026)', () => {
  const tasse = {
    id: 'ki-de-tasse', term: 'Tasse', language: 'de', german: 'Trinkgefäß mit Henkel', romanization: 'ˈtasə',
    germanNoun: { article: 'die', plural: 'die Tassen' }, partOfSpeech: 'noun', register: 'neutral',
    isConcrete: true, sourceVerified: false, translations: { th: 'ถ้วย' },
  } as unknown as VocabEntry;

  it('Artikelaufgabe: „___ Tasse“, nicht „___ Trinkgefäß mit Henkel“', () => {
    expect(bareNoun(tasse)).toBe('Tasse');
    expect(buildArticleQuestion(tasse, 'th').visible).toBe('___ Tasse');
    expect(bareNoun({ ...tasse, term: 'die Tasse' } as VocabEntry)).toBe('Tasse');
  });

  it('Stammformen: sichtbar ist das Verb', () => {
    const gehen = {
      ...tasse, id: 'ki-de-gehen', term: 'gehen', german: 'sich zu Fuß fortbewegen', germanNoun: undefined,
      partOfSpeech: 'verb', germanVerb: { thirdPerson: 'geht', praeteritum: 'ging', perfekt: 'ist gegangen', irregular: true },
    } as unknown as VocabEntry;
    const frage = buildVerbFormQuestion(gehen, [gehen, ...VOCABULARY], seededRandom(1), 'th');
    expect(frage.visible).toBe('gehen');
  });
});
