import { FIXTURE_GERMAN } from '@/test-fixtures/fixture-catalog';
import { VOCABULARY_EN, VOCABULARY_ES, VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { UI_LANGUAGES } from '@/lib/i18n/types';

import {
  directionForBridge,
  goalEndonym,
  goalLanguage,
  LERNZIELE,
  wortschatzFuerZiel,
  zieleFuerBruecke,
  zielFuerDirection,
} from './goals';
import {
  contentDirectionOf,
  isDeAnchored,
  isPairDirection,
  LANGUAGE_CODES,
  targetLanguageOf,
  type Lang,
  type ForeignBridge,
} from './types';

/**
 * Lernziele nach dem Sprach-Umbau (23.09.2026): EINE Regel für alle 20
 * App-Sprachen — jede Lernsprache außer der App-Sprache selbst. Die
 * Nutzerentscheidungen stehen hier als feste Prüfpunkte.
 */
describe('Lernziele — eine Regel für jede App-Sprache', () => {
  it('deutsche Oberfläche: Thai, Englisch, Spanisch — Deutsch ausgeblendet (Nutzerentscheidung 19.09.)', () => {
    expect(LERNZIELE.map((ziel) => ziel.direction)).toEqual(['de_to_th', 'de_to_en', 'de_to_es']);
    expect(LERNZIELE.map(goalLanguage)).toEqual(['th', 'en', 'es']);
  });

  it('Thai-Oberfläche: Englisch, Spanisch, Deutsch — Thai ausgeblendet (Testlauf 08.10.)', () => {
    expect(zieleFuerBruecke('th')).toEqual([
      { direction: 'th_to_en', language: 'en' },
      { direction: 'th_to_es', language: 'es' },
      { direction: 'th_to_de', language: 'de' },
    ]);
  });

  it('englische und spanische Oberfläche: alle anderen Lernsprachen inklusive Deutsch', () => {
    expect(zieleFuerBruecke('en').map((ziel) => ziel.direction)).toEqual(['en_to_th', 'en_to_es', 'en_to_de']);
    expect(zieleFuerBruecke('es').map((ziel) => ziel.direction)).toEqual(['es_to_th', 'es_to_en', 'es_to_de']);
  });

  it('Oberflächen ohne eigene Lernsprache: alle Lernsprachen, Deutsch zuerst (ar-Pilot 10.09.)', () => {
    expect(zieleFuerBruecke('ar').map((ziel) => ziel.direction)).toEqual(['ar_to_de', 'ar_to_th', 'ar_to_en', 'ar_to_es']);
    for (const ui of UI_LANGUAGES.filter((code) => !(LANGUAGE_CODES as readonly string[]).includes(code))) {
      expect(zieleFuerBruecke(ui as ForeignBridge)).toHaveLength(LANGUAGE_CODES.length);
    }
  });

  it('die gelernte Sprache ist immer die rechte Seite der Richtung', () => {
    for (const ui of UI_LANGUAGES) {
      for (const ziel of zieleFuerBruecke(ui as Lang | ForeignBridge)) {
        expect(goalLanguage(ziel)).toBe(targetLanguageOf(ziel.direction));
        expect(zielFuerDirection(ziel.direction)).not.toBeNull();
      }
    }
    expect(targetLanguageOf('th_to_de')).toBe('de');
    expect(targetLanguageOf('de_to_th')).toBe('th');
    expect(targetLanguageOf('ar_to_es')).toBe('es');
  });

  it('trägt das Endonym aus der Sprachdefinition — auch für Deutsch', () => {
    const deutsch = zieleFuerBruecke('th').find((ziel) => ziel.language === 'de')!;
    expect(goalEndonym(deutsch)).toBe('Deutsch');
    expect(goalEndonym(LERNZIELE[0])).toBe('ภาษาไทย');
  });
});

describe('Gemerkte Ziele beim Wechsel der App-Sprache', () => {
  it('behält ein Ziel, das es auf der Oberfläche gibt', () => {
    expect(directionForBridge('de', 'de_to_es')).toBe('de_to_es');
    expect(directionForBridge('th', 'th_to_es')).toBe('th_to_es');
  });

  it('hält die Zielsprache fest: de_to_es wird auf englischer Oberfläche zu en_to_es', () => {
    expect(directionForBridge('en', 'de_to_es')).toBe('en_to_es');
    expect(directionForBridge('ar', 'th_to_de')).toBe('ar_to_de');
  });

  it('fällt aufs erste Ziel zurück, wenn die Zielsprache die App-Sprache selbst ist', () => {
    // Deutsch lernen auf deutscher Oberfläche gibt es nicht (Nutzerentscheidung 19.09.).
    expect(directionForBridge('de', 'th_to_de')).toBe('de_to_th');
    expect(directionForBridge('en', 'de_to_en')).toBe('en_to_th');
  });
});

describe('Wortschatz je Ziel', () => {
  it('zählt den Bestand der Zielsprache — für jede Oberfläche gleich', () => {
    expect(wortschatzFuerZiel({ direction: 'de_to_th', language: 'th' })).toBe(VOCABULARY_TH.length);
    expect(wortschatzFuerZiel({ direction: 'ar_to_th', language: 'th' })).toBe(VOCABULARY_TH.length);
    expect(wortschatzFuerZiel({ direction: 'th_to_en', language: 'en' })).toBe(VOCABULARY_EN.length);
    expect(wortschatzFuerZiel({ direction: 'en_to_es', language: 'es' })).toBe(VOCABULARY_ES.length);
    expect(wortschatzFuerZiel({ direction: 'th_to_de', language: 'de' })).toBe(FIXTURE_GERMAN.length);
  });
});

describe('Richtungs-Typbasis (types.ts)', () => {
  it('die Inhalts-Richtung jeder Lernsprache ist eine gültige Richtung', () => {
    for (const code of LANGUAGE_CODES) {
      const direction = contentDirectionOf(code);
      expect(isPairDirection(direction)).toBe(true);
      expect(targetLanguageOf(direction)).toBe(code);
    }
    expect(contentDirectionOf('de')).toBe('th_to_de');
    expect(contentDirectionOf('th')).toBe('de_to_th');
  });

  it('isPairDirection erkennt jede Richtung App-Sprache → Lernsprache, aber keine Selbstpaare', () => {
    expect(isPairDirection('en_to_es')).toBe(true);
    expect(isPairDirection('ar_to_th')).toBe(true);
    expect(isPairDirection('de_to_de')).toBe(false);
    expect(isPairDirection('th_to_ar')).toBe(false);
    expect(isPairDirection('quatsch')).toBe(false);
  });

  it('isDeAnchored bleibt die Typgrenze für Profile/Backups alter Form', () => {
    expect(isDeAnchored('de_to_th')).toBe(true);
    expect(isDeAnchored('th_to_de')).toBe(true);
    expect(isDeAnchored('en_to_es')).toBe(false);
    expect(isDeAnchored('ar_to_de')).toBe(false);
  });
});
