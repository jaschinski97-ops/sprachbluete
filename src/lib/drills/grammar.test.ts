import { POLITE_ITEMS, POLITE_SOURCE } from '@/data/grammar-th';
import { SER_ESTAR_ITEMS, SER_ESTAR_SOURCE } from '@/data/grammar-es';
import { VOCABULARY_EN } from '@/test-fixtures/legacy-vocabulary-en';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';

import { MemoryDataStore, type DataStore } from '../storage';
import { DRILL_META } from './types';

import {
  buildKonsonantenklasseQuestion,
  buildPoliteQuestion,
  buildSerEstarQuestion,
} from './grammar';
import { THAI_CONSONANTS } from '@/data/thai-script';
import { thaiConsonantSyllable } from '../foundations';
import type { VocabEntry } from '@/data/vocab-types';
import { translate } from '../i18n';

import {
  buildDeutschLesenQuestion,
  buildIrregularPastQuestion,
  buildPraesensEndungQuestion,
  canBuildDeutschLesenQuestion,
  canBuildIrregularPastQuestion,
  canBuildPraesensEndungQuestion,
} from './questions';
import { seededRandom } from './random';
import { buildDrillSession } from './session';

const T0 = Date.UTC(2026, 8, 1, 10);

async function freshStore(): Promise<DataStore> {
  const store = new MemoryDataStore();
  await store.init();
  return store;
}

describe('Höflichkeitspartikel (ครับ/ค่ะ)', () => {
  it('leitet die Antwort aus dem Sprechergeschlecht her', () => {
    for (const item of POLITE_ITEMS) {
      expect(item.answer).toBe(item.speaker === 'male' ? 'ครับ' : 'ค่ะ');
    }
  });

  it('stammt wörtlich aus dem geprüften Satzbestand und trägt den Nachweis', () => {
    expect(POLITE_ITEMS.length).toBeGreaterThanOrEqual(10);
    for (const item of POLITE_ITEMS) {
      expect(item.text).not.toContain('ครับ');
      expect(item.text).not.toContain('ค่ะ');
      expect(item.german.length).toBeGreaterThan(0);
      expect(item.roman.length).toBeGreaterThan(0);
    }
    expect(POLITE_SOURCE.url).toContain('thai-language.com');
  });

  it('stellt die Partikel-Wahl mit sichtbarem Satz, ohne Audio', () => {
    const frage = buildPoliteQuestion(POLITE_ITEMS[0]);
    expect(frage.drill).toBe('polite');
    expect(frage.visible).toContain('___');
    expect(frage.speak).toBeNull();
    expect(frage.options.map((option) => option.label)).toEqual(['ครับ', 'ค่ะ']);
    expect(frage.options[frage.correctIndex].label).toBe(POLITE_ITEMS[0].answer);
    expect(frage.visibleRoman).toContain(POLITE_ITEMS[0].roman);
    expect(frage.options.every((option) => option.roman)).toBe(true);
    expect(frage.solutionRoman).toContain(POLITE_ITEMS[0].roman);
  });
});

describe('ser oder estar', () => {
  it('arbeitet mit Lückensätzen und nennt die entscheidende Regel', () => {
    for (const item of SER_ESTAR_ITEMS) {
      expect(item.text).toContain('___');
      expect(item.reason.length).toBeGreaterThan(10);
      expect(['ser', 'estar']).toContain(item.answer);
    }
    expect(SER_ESTAR_SOURCE.url).toContain('studyspanish.com');
  });

  it('füllt die Lücke in der Lösung mit der gebeugten Form', () => {
    const ser = buildSerEstarQuestion(SER_ESTAR_ITEMS.find((item) => item.answer === 'ser')!);
    expect(ser.solution).not.toContain('___');
    expect(ser.solution).toContain('es');
    const estar = buildSerEstarQuestion(SER_ESTAR_ITEMS.find((item) => item.answer === 'estar')!);
    expect(estar.solution).toContain('está');
  });

  it('beugt nach dem Subjekt statt immer in der 3. Person Singular', () => {
    const loesung = (id: string) =>
      buildSerEstarQuestion(SER_ESTAR_ITEMS.find((item) => item.id === id)!).solution;
    expect(loesung('se-aburrido')).toBe('Yo estoy aburrido.');
    expect(loesung('se-ninos')).toBe('Los niños están cansados.');
  });
});

describe('Konsonantenklassen (Paiboon-Umschrift)', () => {
  const konsonant = (symbol: string) => THAI_CONSONANTS.find((k) => k.symbol === symbol)!;

  it('nennt den Konsonanten wie Kapitel 0: Silbe plus Merkwort aus dem Wortschatz', () => {
    const frage = buildKonsonantenklasseQuestion(konsonant('ก'));
    const name = 'gɔɔ gài'.normalize('NFC');
    expect(frage.visibleRoman).toBe(name);
    expect(frage.solutionRoman).toBe(name);
    expect(frage.visibleHint).toBe(`Huhn · ${name}`);
  });

  it('zeigt ohne Merkwort im Katalog nur die Konsonantensilbe', () => {
    // ถุง steht nicht im Testkatalog; auf der fr-Brücke gibt es keine Merkwort-Bedeutung.
    const frage = buildKonsonantenklasseQuestion(konsonant('ถ'), 'fr', 'fr');
    const silbe = 'thɔ̌ɔ'.normalize('NFC');
    expect(frage.visibleRoman).toBe(silbe);
    expect(frage.visibleHint).toBe(silbe);
    expect(frage.solutionRoman).toBe(silbe);
  });

  it('zeigt in keiner Aufgabe mehr die RTGS-Umschrift', async () => {
    const session = await buildDrillSession({ drill: 'konsonantenklasse', language: 'th', store: await freshStore(), now: T0, size: 50 });
    expect(session.questions.length).toBe(session.available);
    for (const frage of session.questions) {
      const k = konsonant(frage.vocabId);
      for (const text of [frage.visibleRoman, frage.visibleHint, frage.solutionRoman]) {
        expect(text).toContain(thaiConsonantSyllable(k));
        expect(text).not.toContain(k.nameRtgs);
      }
    }
  });
});

describe('Präsens-Endungen', () => {
  const verb = (term: string, conjugation: 'ar' | 'er' | 'ir') =>
    ({ id: `t-${term}`, language: 'es', term, german: term, spanishVerb: { conjugation, irregular: false } }) as unknown as VocabEntry;

  it('bietet jede Endung nur einmal an (-er und -ir teilen Endungen)', () => {
    for (let saat = 1; saat <= 40; saat += 1) {
      const frage = buildPraesensEndungQuestion(verb('comer', 'er'), [], seededRandom(saat));
      const labels = frage.options.map((o) => o.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('lässt Verben mit Akzent- oder Schreibwechsel aus', () => {
    expect(canBuildPraesensEndungQuestion(verb('hablar', 'ar'))).toBe(true);
    for (const [term, klasse] of [['evaluar', 'ar'], ['vaciar', 'ar'], ['proteger', 'er'], ['convencer', 'er']] as const) {
      expect(canBuildPraesensEndungQuestion(verb(term, klasse))).toBe(false);
    }
  });
});

describe('Grammatik-Sitzungen ohne Kartenstoff', () => {
  it('mischt die Partikel-Runde und legt KEINE FSRS-Karten an', async () => {
    const store = await freshStore();
    const session = await buildDrillSession({ drill: 'polite', language: 'th', store, now: T0 });
    expect(session.available).toBe(POLITE_ITEMS.length);
    expect(session.questions.length).toBe(Math.min(10, POLITE_ITEMS.length));
    for (const frage of session.questions) {
      expect(frage.drill).toBe('polite');
    }
    // Der Seiteneffekt wäre genau der Kartenschlüssel, den keine Bewertung
    // je fortreibt — die Partikel-Übung darf ihn nicht erzeugen. `jest`
    // fängt `ensureCardStates` hier nicht; der echte Store bleibt leer,
    // weil der Datensatz-Zweig ihn nie berührt.
    const kartenSchluessel = session.questions.map((frage) => `${frage.vocabId}:de_to_th`);
    for (const schluessel of kartenSchluessel) {
      expect(await store.get<unknown>('cards', schluessel)).toBeNull();
    }
  });

  it('mischt die ser/estar-Runde aus dem spanischen Datensatz', async () => {
    const store = await freshStore();
    const session = await buildDrillSession({ drill: 'serEstar', language: 'es', store, now: T0 });
    expect(session.available).toBe(SER_ESTAR_ITEMS.length);
    expect(session.questions.every((frage) => frage.drill === 'serEstar')).toBe(true);
  });
});

describe('Wort lesen (Deutsch als Ziel)', () => {
  const pool = VOCABULARY_TH;

  it('nimmt jeden Grundeintrag — lesen braucht keine Zusatzdaten', () => {
    expect(pool.filter(canBuildDeutschLesenQuestion).length).toBe(pool.length);
  });

  it('zeigt nur das deutsche Wort und wählt die Bedeutung', () => {
    const entry = pool[0];
    const frage = buildDeutschLesenQuestion(entry, pool, seededRandom(T0));
    expect(frage.drill).toBe('deutschLesen');
    expect(frage.direction).toBe('th_to_de');
    expect(frage.visible).toBe(entry.german.split(',')[0].trim());
    expect(frage.visibleHint).toBeNull();
    expect(frage.speak).toBeNull();
    expect(frage.options).toHaveLength(4);
    expect(frage.options[frage.correctIndex].label).toBe(entry.term);
    expect(new Set(frage.options.map((option) => option.label)).size).toBe(4);
  });
});

describe('Unregelmäßige Verben (Englisch)', () => {
  const pool = VOCABULARY_EN;
  const unregelmaessig = pool.filter(canBuildIrregularPastQuestion);

  it('nimmt nur unregelmäßige Verben mit hinterlegter Form', () => {
    expect(unregelmaessig.length).toBeGreaterThanOrEqual(10);
    for (const entry of unregelmaessig) {
      expect(entry.englishVerb?.irregular).toBe(true);
      expect(entry.englishVerb?.past).toBeTruthy();
    }
    // Regelmäßige (oder verblose) Einträge bleiben außen vor.
    const regelmaessig = pool.filter((entry) => entry.englishVerb && !canBuildIrregularPastQuestion(entry));
    for (const entry of regelmaessig) {
      expect(entry.englishVerb?.irregular).toBe(false);
    }
  });

  it('bietet echte zweite Formen anderer Verben als Ablenker', () => {
    const entry = unregelmaessig[0];
    const frage = buildIrregularPastQuestion(entry, pool, seededRandom(T0));
    expect(frage.direction).toBe('de_to_en');
    expect(frage.options).toHaveLength(4);
    expect(frage.options[frage.correctIndex].label).toBe(entry.englishVerb!.past);
    for (const option of frage.options) {
      const quelle = pool.find((other) => other.englishVerb?.past === option.label);
      expect(quelle).toBeTruthy();
    }
  });

  it('spricht auf einer thailändischen Oberfläche kein Deutsch', () => {
    const entry = { ...unregelmaessig[0], translations: { th: 'ความหมาย' } } as VocabEntry;
    const frage = buildIrregularPastQuestion(entry, pool, seededRandom(T0), 'th', 'th');
    expect(frage.visibleHint).toBe('ความหมาย');
    expect(frage.explanation).not.toMatch(/unregelmäßig|regelmäßig/);
    expect(frage.explanation).toContain(translate('th', 'drill.irregular'));
  });
});

describe('Die neuen Übungen hängen an den richtigen Kategorien', () => {
  it('liest als Lesen und grammatikalisiert die Merkmalssprachen', () => {
    expect(DRILL_META.deutschLesen.skill).toBe('lesen');
    expect(DRILL_META.polite.skill).toBe('grammatik');
    expect(DRILL_META.irregularPast.skill).toBe('grammatik');
    expect(DRILL_META.serEstar.skill).toBe('grammatik');
  });
});
