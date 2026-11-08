import { FIXTURE_CATALOG, FIXTURE_GERMAN } from '@/test-fixtures/fixture-catalog';
import { setCurrentCatalog } from '@/lib/content/catalog-state';
import { VOCABULARY_EN, VOCABULARY_ES, VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { UI_LANGUAGES } from '@/lib/i18n/types';

import {
  directionForBridge,
  goalEndonym,
  goalLanguage,
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
    const ziele = zieleFuerBruecke('de');
    expect(ziele.map((ziel) => ziel.direction)).toEqual(['de_to_th', 'de_to_en', 'de_to_es', 'de_to_fr', 'de_to_pt', 'de_to_it', 'de_to_zh', 'de_to_ja']);
    expect(ziele.map(goalLanguage)).toEqual(['th', 'en', 'es', 'fr', 'pt', 'it', 'zh', 'ja']);
  });

  it('Thai-Oberfläche: Englisch, Spanisch, Deutsch — Thai ausgeblendet (Testlauf 08.10.)', () => {
    expect(zieleFuerBruecke('th')).toEqual([
      { direction: 'th_to_en', language: 'en' },
      { direction: 'th_to_es', language: 'es' },
      { direction: 'th_to_de', language: 'de' },
      { direction: 'th_to_fr', language: 'fr' },
      { direction: 'th_to_pt', language: 'pt' },
      { direction: 'th_to_it', language: 'it' },
      { direction: 'th_to_zh', language: 'zh' },
      { direction: 'th_to_ja', language: 'ja' },
    ]);
  });

  it('englische und spanische Oberfläche: alle anderen Lernsprachen inklusive Deutsch', () => {
    expect(zieleFuerBruecke('en').map((ziel) => ziel.direction)).toEqual(['en_to_th', 'en_to_es', 'en_to_de', 'en_to_fr', 'en_to_pt', 'en_to_it', 'en_to_zh', 'en_to_ja']);
    expect(zieleFuerBruecke('es').map((ziel) => ziel.direction)).toEqual(['es_to_th', 'es_to_en', 'es_to_de', 'es_to_fr', 'es_to_pt', 'es_to_it', 'es_to_zh', 'es_to_ja']);
  });

  it('französische Oberfläche (seit 04.11.2026 Lernsprache): alle anderen, Französisch ausgeblendet', () => {
    expect(zieleFuerBruecke('fr').map((ziel) => ziel.direction)).toEqual(['fr_to_th', 'fr_to_en', 'fr_to_es', 'fr_to_de', 'fr_to_pt', 'fr_to_it', 'fr_to_zh', 'fr_to_ja']);
  });

  it('portugiesische Oberfläche (seit 07.11.2026 Lernsprache): alle anderen, Portugiesisch ausgeblendet', () => {
    expect(zieleFuerBruecke('pt').map((ziel) => ziel.direction)).toEqual(['pt_to_th', 'pt_to_en', 'pt_to_es', 'pt_to_de', 'pt_to_fr', 'pt_to_it', 'pt_to_zh', 'pt_to_ja']);
  });

  it('chinesische Oberfläche (seit 07.11.2026 Lernsprache): alle anderen, Chinesisch ausgeblendet', () => {
    expect(zieleFuerBruecke('zh').map((ziel) => ziel.direction)).toEqual(['zh_to_th', 'zh_to_en', 'zh_to_es', 'zh_to_de', 'zh_to_fr', 'zh_to_pt', 'zh_to_it', 'zh_to_ja']);
  });

  it('italienische und japanische Oberfläche (seit 07.11.2026): alle anderen, die eigene Sprache ausgeblendet', () => {
    expect(zieleFuerBruecke('it').map((ziel) => ziel.direction)).toEqual(['it_to_th', 'it_to_en', 'it_to_es', 'it_to_de', 'it_to_fr', 'it_to_pt', 'it_to_zh', 'it_to_ja']);
    expect(zieleFuerBruecke('ja').map((ziel) => ziel.direction)).toEqual(['ja_to_th', 'ja_to_en', 'ja_to_es', 'ja_to_de', 'ja_to_fr', 'ja_to_pt', 'ja_to_it', 'ja_to_zh']);
  });

  it('zeigt eine Lernsprache ohne Wortschatz nicht als Ziel (Französisch vor dem ersten Wortlauf)', () => {
    setCurrentCatalog({
      ...FIXTURE_CATALOG,
      entries: FIXTURE_CATALOG.entries.filter((entry) => !['fr', 'pt', 'it', 'zh', 'ja'].includes(String((entry.document as { language?: string }).language))),
    });
    try {
      expect(zieleFuerBruecke('de').map((ziel) => ziel.direction)).toEqual(['de_to_th', 'de_to_en', 'de_to_es']);
      // Leerer Katalog (frischer Neuaufbau): alle Ziele bleiben sichtbar.
      setCurrentCatalog({ ...FIXTURE_CATALOG, entries: [] });
      expect(zieleFuerBruecke('de')).toHaveLength(LANGUAGE_CODES.length - 1);
    } finally {
      setCurrentCatalog(FIXTURE_CATALOG);
    }
  });

  it('Oberflächen ohne eigene Lernsprache: alle Lernsprachen, Deutsch zuerst (ar-Pilot 10.09.)', () => {
    expect(zieleFuerBruecke('ar').map((ziel) => ziel.direction)).toEqual(['ar_to_de', 'ar_to_th', 'ar_to_en', 'ar_to_es', 'ar_to_fr', 'ar_to_pt', 'ar_to_it', 'ar_to_zh', 'ar_to_ja']);
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
    expect(goalEndonym(zieleFuerBruecke('de')[0])).toBe('ภาษาไทย');
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
