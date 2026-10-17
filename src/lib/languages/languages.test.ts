import { FIXTURE_VOCABULARY } from '@/test-fixtures/fixture-catalog';
import { VOCABULARY, VOCABULARY_EN, VOCABULARY_ES, VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { syllablesOf, uniformTone } from '@/data/vocab-helpers';

import { drillsForDirection } from '../drills/types';
import { createCardState, reviewCard } from '../fsrs/fsrs';
import { cardKey } from '../fsrs/types';
import { loadCardState, loadVocabulary } from '../repository';
import { MemoryDataStore } from '../storage';
import { CURRENT_SCHEMA_VERSION, migrateStore, readSchemaVersion } from '../storage/migration';

import { drillsForDirectionViaFeature, featureFor, featureRuntime } from './feature';
import {
  defaultLanguage,
  directionLabel,
  hasContent,
  LANGUAGES,
  LANGUAGE_ORDER,
  languagesWithContent,
} from './registry';
import {
  Direction,
  directionsFor,
  HUB_LANGUAGE,
  LANGUAGE_CODES,
  targetLanguageOf,
} from './types';

/**
 * Phase 15 — das Sprachmodell.
 *
 * Drei Aussagen tragen diese Datei:
 *
 * 1. **Die Erweiterung bricht nichts.** `'de_to_th'` und `'th_to_de'` bleiben
 *    gültige Werte, und gespeicherte Kartenzustände überstehen die Migration
 *    mit ihrem Lernfortschritt — geprüft an einer Karte mit echten Werten,
 *    nicht an einer frischen.
 * 2. **Thai läuft durch die neue Naht.** Das Merkmal liefert genau das, was
 *    vorher fest verdrahtet war.
 * 3. **Die leeren Sprachen sind als leer erkennbar** und behaupten kein
 *    Merkmal, das nicht gebaut ist.
 */

describe('Inhalts-Richtungen (seit dem Sprach-Umbau 23.09.2026)', () => {
  it('speichert jede Lernsprache unter genau einer Richtung — Deutsch unter th_to_de', () => {
    for (const language of LANGUAGE_CODES) {
      const [direction, ...rest] = directionsFor(language);
      expect(rest).toEqual([]);
      expect(direction).toBe(language === 'de' ? 'th_to_de' : `de_to_${language}`);
      expect(targetLanguageOf(direction)).toBe(language);
    }
    expect(HUB_LANGUAGE).toBe('de');
  });

  it('lässt die bisherigen Richtungswerte wörtlich gültig', () => {
    // Der Grund, warum kein einziger Kartenschluessel angefasst werden musste.
    const alt: Direction[] = ['de_to_th', 'th_to_de'];
    expect(alt.map(targetLanguageOf)).toEqual(['th', 'de']);
    expect(cardKey('sawatdii', 'de_to_th')).toBe('sawatdii:de_to_th');
  });

  it('baut Beschriftungen aus dem Verzeichnis statt aus einer Tabelle', () => {
    // Eine Tabelle muesste bei jeder neuen Sprache an zwei Stellen nachgezogen
    // werden, und eine davon wuerde vergessen.
    expect(directionLabel('th_to_de')).toBe('Thai → Deutsch');
    expect(directionLabel('de_to_th')).toBe('Deutsch → Thai');
    expect(directionLabel('de_to_es')).toBe('Deutsch → Spanisch');
    expect(directionLabel('en_to_de')).toBe('Englisch → Deutsch');
  });

  it('beschriftet Richtungen in der gegebenen UI-Sprache, ohne Angabe auf Deutsch', () => {
    // Seit dem i18n-Gerüst kommen die Namen aus LANGUAGE_DISPLAY_NAMES —
    // ein Thai sieht seine Richtung in thailändischer Schrift, und der
    // providerlose Aufruf (Tests, Rest-Bestand) bleibt beim deutschen Stand.
    expect(directionLabel('de_to_th', 'en')).toBe('German → Thai');
    expect(directionLabel('th_to_de', 'th')).toBe('ภาษาไทย → ภาษาเยอรมัน');
    expect(directionLabel('de_to_es')).toBe('Deutsch → Spanisch');
  });
});

describe('Das Verzeichnis', () => {
  it('führt vier Lernsprachen — Deutsch gleichberechtigt —, alle mit Inhalten', () => {
    expect(LANGUAGE_CODES).toEqual(['th', 'en', 'es', 'de']);
    expect(languagesWithContent().map((language) => language.code).sort()).toEqual([
      'de',
      'en',
      'es',
      'th',
    ]);
    for (const code of LANGUAGE_CODES) expect(hasContent(code)).toBe(true);
  });

  it('zählt jeden Grundstock aus seiner Datei statt ihn zu behaupten', () => {
    expect(LANGUAGES.th.entryCount).toBe(VOCABULARY_TH.length);
    expect(LANGUAGES.en.entryCount).toBe(VOCABULARY_EN.length);
    expect(LANGUAGES.es.entryCount).toBe(VOCABULARY_ES.length);
    expect(VOCABULARY).toHaveLength(
      VOCABULARY_TH.length + VOCABULARY_EN.length + VOCABULARY_ES.length
    );
  });

  it('bleibt bei Thai als Vorgabe, obwohl alle drei Inhalte haben', () => {
    // Der eigentliche Punkt: Die Vorgabe darf nicht aus einer Sortierung
    // fallen. Sonst faende jemand nach einem Update Englisch vor, obwohl er
    // seit Wochen Thai lernt.
    expect(defaultLanguage()).toBe('th');
    expect(LANGUAGE_ORDER[0]).toBe('th');
  });

  it('belegt jedes Merkmal mit einer Quelle (Pflicht 4)', () => {
    for (const code of LANGUAGE_CODES) {
      const feature = LANGUAGES[code].feature;
      expect(feature.source).toBeTruthy();
      expect(feature.source!.retrieved).toMatch(/^2026-09-\d\d$/);
      expect(feature.source!.url).toContain('wikipedia.org');
      // Das Zitat traegt die Entscheidung - eine Behauptung ohne Beleg waere
      // genau das, was seit Phase 2 nicht vorkommen soll.
      expect(feature.source!.quote.length).toBeGreaterThan(60);
    }
  });

  it('unterscheidet ableitbare Merkmale von solchen, die je Wort stehen müssen', () => {
    // Der Kern der Recherche: Thai und Spanisch sind Regelsysteme, Englisch
    // ist es nachweislich nicht.
    expect(LANGUAGES.th.feature.kind).toBe('derivable');
    expect(LANGUAGES.es.feature.kind).toBe('derivable');
    expect(LANGUAGES.es.feature.source!.quote).toContain('unequivocally');
    expect(LANGUAGES.en.feature.kind).toBe('per-word');
    expect(LANGUAGES.en.feature.source!.quote).toContain('unpredictable');
  });

  it('führt seit Phase 16 für jede Sprache ein gebautes Merkmal', () => {
    // In Phase 15 stand hier das Gegenteil, und das war damals die ehrliche
    // Aussage: entschieden, aber nicht gebaut. Phase 16 hat beide gebaut -
    // Spanisch als Herleitung, Englisch ausdruecklich NICHT als solche.
    for (const code of LANGUAGE_CODES) expect(LANGUAGES[code].feature.implemented).toBe(true);
  });

  it('ordnet die deutschen Module jedem Paar zu, nicht Thai allein (Pflicht 6)', () => {
    for (const code of LANGUAGE_CODES) expect(LANGUAGES[code].hasGermanModules).toBe(true);
  });
});

describe('Das Merkmal als einhängbarer Baustein (Pflicht 3)', () => {
  it('liefert für Thai genau das, was vorher fest verdrahtet war', () => {
    const sawatdii = VOCABULARY.find((entry) => entry.id === 'sawatdii')!;
    expect(featureFor(sawatdii).annotate(sawatdii)).toEqual(sawatdii.syllables);
    // สวัสดี ist tief-tief-mittel (AE-7) - die Aussage aus Phase 3, unveraendert.
    expect(syllablesOf(sawatdii).map((s) => s.tone)).toEqual(['low', 'low', 'mid']);
    expect(uniformTone(sawatdii)).toBeNull();
  });

  it('faellt auf eine Silbe zurück, wenn ein Altdatensatz keine hat', () => {
    const entry = { ...VOCABULARY[0], syllables: [] };
    expect(featureFor(entry).annotate(entry)).toEqual([
      { roman: entry.romanization, tone: entry.tone },
    ]);
  });

  it('gibt jeder Sprache genau die Übungen ihres eigenen Merkmals', () => {
    // Seit Phase 18 hat jede Sprache eine Hoer- UND eine Leseuebung ihres
    // Merkmals - vorher fehlte den beiden neuen Sprachen das Hoeren.
    expect(featureRuntime('th').drills).toEqual(['tone', 'toneRule', 'polite', 'zaehlerwort', 'konsonantenklasse']);
    expect(featureRuntime('es').drills).toEqual(['stressHear', 'stressRule', 'serEstar', 'praesensEndung']);
    expect(featureRuntime('en').drills).toEqual(['soundSpelling', 'spelling', 'irregularPast', 'partizip']);
    // Und keine Übung wandert in eine fremde Sprache.
    expect(drillsForDirectionViaFeature('de_to_es')).toEqual(['stressHear', 'stressRule', 'serEstar', 'praesensEndung']);
    expect(drillsForDirectionViaFeature('de_to_en')).toEqual(['soundSpelling', 'spelling', 'irregularPast', 'partizip']);
    expect(drillsForDirectionViaFeature('de_to_th')).toEqual(['tone', 'toneRule', 'polite', 'zaehlerwort', 'konsonantenklasse']);
  });

  it('zeichnet spanische Silben mit der Betonung aus, englische mit der Lautschrift', () => {
    const medico = VOCABULARY_ES.find((entry) => entry.id === 'es_medico')!;
    expect(featureFor(medico).annotate(medico)).toEqual([
      { roman: 'mé', stressed: true },
      { roman: 'di' },
      { roman: 'co' },
    ]);
    const enough = VOCABULARY_EN.find((entry) => entry.id === 'en_enough')!;
    expect(featureFor(enough).annotate(enough)).toEqual([{ roman: '/ɪˈnʌf/' }]);
  });

  it('hängt die deutschen Übungen (Grammatik + Lesen) an jedes „X → Deutsch"', () => {
    for (const code of LANGUAGE_CODES.filter((sprache) => sprache !== 'de')) {
      expect(drillsForDirection(`${code}_to_de` as const)).toEqual(['article', 'verbForms', 'deutschLesen']);
    }
  });

  it('lässt die Thai-Übungen dort, wo sie hingehören', () => {
    expect(drillsForDirection('de_to_th')).toEqual(['tone', 'toneRule', 'polite', 'zaehlerwort', 'konsonantenklasse']);
  });
});

describe('Migration eines vorhandenen Speichers (AE-43)', () => {
  /** Ein Eintrag in der Form vor Phase 15. */
  const altesFormat = {
    id: 'sawatdii',
    thai: 'สวัสดี',
    romanization: 'sà-wàt-dii',
    tone: 'low',
    syllables: [{ roman: 'sà', tone: 'low' }],
    german: 'hallo, guten Tag',
    partOfSpeech: 'interjection',
    register: 'neutral',
    isConcrete: false,
    exampleThai: 'สวัสดี ครับ',
    exampleRoman: 'sà-wàt-dii kráp',
    exampleGerman: 'Hallo.',
    sourceVerified: true,
  };

  async function altenSpeicherBauen() {
    const store = new MemoryDataStore();
    await store.init();
    await store.put('vocab', altesFormat.id, altesFormat);

    // Eine Karte mit echtem Lernfortschritt, keine frische: Genau die darf
    // die Migration nicht verlieren.
    const frisch = createCardState('sawatdii', 'de_to_th', Date.UTC(2026, 0, 1));
    const gelernt = reviewCard(reviewCard(frisch, 3, Date.UTC(2026, 0, 1)), 4, Date.UTC(2026, 0, 5));
    await store.put('cards', cardKey('sawatdii', 'de_to_th'), gelernt);
    return { store, gelernt };
  }

  it('erkennt einen Speicher aus der Zeit vor Phase 15', async () => {
    const { store } = await altenSpeicherBauen();
    expect(await readSchemaVersion(store)).toBe(1);
  });

  it('bringt die Vokabeln auf die neue Form', async () => {
    const { store } = await altenSpeicherBauen();
    const ergebnis = await migrateStore(store);

    expect(ergebnis).toMatchObject({ from: 1, to: CURRENT_SCHEMA_VERSION, migrated: true });
    expect(ergebnis.reseeded).toBe(FIXTURE_VOCABULARY.length);

    const entries = await loadVocabulary(store);
    expect(entries).toHaveLength(FIXTURE_VOCABULARY.length);
    for (const entry of entries) {
      expect(entry.term).toBeTruthy();
      expect(LANGUAGE_CODES).toContain(entry.language);
      expect((entry as unknown as Record<string, unknown>).thai).toBeUndefined();
    }
    // Der Thai-Teil ist danach genau der aus der Datei - die Migration hat ihn
    // nicht angefasst, sondern neu eingespielt.
    expect(entries.filter((entry) => entry.language === 'th')).toHaveLength(VOCABULARY_TH.length);
  });

  it('lässt den Lernfortschritt unangetastet — das ist der eigentliche Punkt', async () => {
    const { store, gelernt } = await altenSpeicherBauen();
    await migrateStore(store);

    const danach = await loadCardState('sawatdii', 'de_to_th', store);
    expect(danach).toEqual(gelernt);
    expect(danach!.reps).toBe(2);
    expect(danach!.stability).toBe(gelernt.stability);
    expect(danach!.due).toBe(gelernt.due);
    // Der Schluessel selbst hat sich nicht geaendert - deshalb ging nichts
    // verloren (AE-42).
    expect(await store.get('cards', 'sawatdii:de_to_th')).not.toBeNull();
  });

  it('ist idempotent — ein zweiter Lauf tut nichts', async () => {
    const { store } = await altenSpeicherBauen();
    await migrateStore(store);
    const zweiter = await migrateStore(store);
    expect(zweiter).toMatchObject({ migrated: false, reseeded: 0 });
    expect(await readSchemaVersion(store)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('spielt auf einem leeren Speicher nichts ein, sondern setzt nur die Version', async () => {
    // Der Erststart legt den Grundstock ohnehin an; hier waere ein zweiter
    // Schreibweg nur eine Fehlerquelle.
    const store = new MemoryDataStore();
    await store.init();
    const ergebnis = await migrateStore(store);
    expect(ergebnis.reseeded).toBe(0);
    expect(await readSchemaVersion(store)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('fasst nie einen Kartenzustand an', async () => {
    const { store } = await altenSpeicherBauen();
    const ergebnis = await migrateStore(store);
    expect(ergebnis.cardsTouched).toBe(0);
  });
});

describe('Der Grundstock trägt seine Sprache', () => {
  it('bei jedem Eintrag, und zwar die seiner Datei', () => {
    expect(VOCABULARY_TH.every((entry) => entry.language === 'th')).toBe(true);
    expect(VOCABULARY_EN.every((entry) => entry.language === 'en')).toBe(true);
    expect(VOCABULARY_ES.every((entry) => entry.language === 'es')).toBe(true);
  });

  it('mit einer nichtleeren fremdsprachigen Form', () => {
    for (const entry of VOCABULARY) {
      expect(entry.term.trim().length).toBeGreaterThan(0);
    }
  });

  it('und mit über alle Sprachen eindeutigen IDs', () => {
    // Der Kartenschluessel ist `vocabId:direction`. Zwei gleiche IDs in
    // verschiedenen Sprachen wuerden sich denselben Lernfortschritt teilen.
    const ids = new Set(VOCABULARY.map((entry) => entry.id));
    expect(ids.size).toBe(VOCABULARY.length);
  });
});
