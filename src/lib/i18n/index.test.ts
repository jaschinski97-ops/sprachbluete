import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryDataStore } from '@/lib/storage';

import {
  FALLBACK_ALLOWED_KEYS,
  I18nProvider,
  UI_LANGUAGES,
  detectSystemLocale,
  dictionaries,
  interpolate,
  languageDisplayName,
  normalizeLanguageCode,
  normalizeLanguageSetting,
  translate,
  useLocale,
  type I18nValue,
  type TranslationKey,
  type UiLanguage,
} from './index';

// Der Provider lädt/speichert über `./prefs` — für die Provider-Tests wird
// das Modul gefasst; die Rundreise durch den Speicher prüfen die Tests
// weiter gegen das ECHTE Modul (`requireActual`).
const mockLoadSetting = jest.fn();
const mockSaveSetting = jest.fn();
jest.mock('./prefs', () => ({
  loadLanguageSetting: (...args: unknown[]) => mockLoadSetting(...args),
  saveLanguageSetting: (...args: unknown[]) => mockSaveSetting(...args),
}));
const realPrefs = jest.requireActual('./prefs') as typeof import('./prefs');

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

// Erst nach dem Mock importieren, damit der Erkennungs-Mock greift.
import { getLocales } from 'expo-localization';

const mockedGetLocales = getLocales as jest.Mock;

function detectFrom(languageCode: string | undefined): UiLanguage {
  mockedGetLocales.mockReturnValue(
    languageCode === undefined ? [] : [{ languageCode, languageTag: languageCode }]
  );
  return detectSystemLocale();
}

beforeEach(() => {
  mockedGetLocales.mockReset();
});

test('automatic delivery count is interpolated in all twenty UI languages', () => {
  for (const language of UI_LANGUAGES) {
    const text = translate(language, 'studio.autoDelivered', { count: 7 });
    expect(text).toContain('7');
    expect(text).not.toMatch(/[{}]/);
  }
});

describe('detectSystemLocale — Normierung der Systemsprache', () => {
  it('erkennt jeden Kanon-Code', () => {
    for (const language of UI_LANGUAGES) expect(detectFrom(language)).toBe(language);
    expect(detectFrom('de')).toBe('de');
    expect(detectFrom('en')).toBe('en');
    expect(detectFrom('es')).toBe('es');
    expect(detectFrom('th')).toBe('th');
    // Die ar-Brücke (Pilot der Heimatsprachen, 10.09.).
    expect(detectFrom('ar')).toBe('ar');
    // Seit dem 20-Sprachen-Ausbau (13.09.2026) im Kanon:
    expect(detectFrom('fr')).toBe('fr');
    expect(detectFrom('zh')).toBe('zh');
    expect(detectFrom('ko')).toBe('ko');
  });

  it('normiert Region-Codes auf die Sprache (th-TH bleibt th, ar-EG wird ar)', () => {
    // `getLocales()[0].languageCode` liefert ohnehin nur den Sprachcode; ein
    // versehentlich voller Tag darf die Erkennung nicht kippen.
    mockedGetLocales.mockReturnValue([{ languageCode: 'th', languageTag: 'th-TH' }]);
    expect(detectSystemLocale()).toBe('th');
    // Systemsprache Ägypten: Je nach Plattform kommt der volle BCP-47-Tag an.
    mockedGetLocales.mockReturnValue([{ languageCode: 'ar', languageTag: 'ar-EG' }]);
    expect(detectSystemLocale()).toBe('ar');
    expect(normalizeLanguageCode('ar-EG')).toBe('ar');
    // Seit dem 20-Sprachen-Ausbau allgemein: pt-BR ist Portugiesisch.
    expect(normalizeLanguageCode('pt-BR')).toBe('pt');
  });

  it('fällt für unbekannte Sprachen auf Englisch zurück', () => {
    expect(detectFrom('it')).toBe('en'); // Italienisch: kein Teil der 20 App-Sprachen
    expect(detectFrom('pl')).toBe('en'); // Polnisch ebenso
    expect(detectFrom(undefined)).toBe('en');
  });

  it('fällt ohne Sprachauskunft und bei Fehlern auf Englisch zurück', () => {
    mockedGetLocales.mockReturnValue(undefined);
    expect(detectSystemLocale()).toBe('en');

    mockedGetLocales.mockImplementation(() => {
      throw new Error('natives Modul fehlt');
    });
    expect(detectSystemLocale()).toBe('en');
  });

  it('normiert rohe Codes auch ohne Erkennung', () => {
    expect(normalizeLanguageCode('FR')).toBe('en'); // bewusst strikt: Kleinschreibung ist der Vertrag von expo-localization
    expect(normalizeLanguageCode('it')).toBe('en'); // Italienisch: nicht im Kanon → Fallback
    expect(normalizeLanguageCode('fr')).toBe('fr'); // seit dem 20-Sprachen-Ausbau im Kanon
    expect(normalizeLanguageCode(42)).toBe('en');
  });
});

describe('Spracheinstellung — nachsichtiges Lesen', () => {
  it('akzeptiert "system" und jeden Kanon-Code', () => {
    expect(normalizeLanguageSetting('system')).toBe('system');
    expect(normalizeLanguageSetting('th')).toBe('th');
  });

  it('verwirft alles andere zugunsten von "system"', () => {
    expect(normalizeLanguageSetting('it')).toBe('system'); // Italienisch: nicht im Kanon der 20
    expect(normalizeLanguageSetting(null)).toBe('system');
    expect(normalizeLanguageSetting(undefined)).toBe('system');
  });

  it('rundet durch Speicher und Lesen', async () => {
    const store = new MemoryDataStore();
    await store.init();
    await realPrefs.saveLanguageSetting('es', store);
    expect(await realPrefs.loadLanguageSetting(store)).toBe('es');

    await realPrefs.saveLanguageSetting('system', store);
    expect(await realPrefs.loadLanguageSetting(store)).toBe('system');
  });

  it('liest ohne Speicherstand "system"', async () => {
    const store = new MemoryDataStore();
    await store.init();
    expect(await realPrefs.loadLanguageSetting(store)).toBe('system');
  });
});

describe('Interpolation', () => {
  it('setzt {{name}}-Platzhalter ein', () => {
    expect(interpolate('Karte {{index}} von {{total}}', { index: 2, total: 10 })).toBe(
      'Karte 2 von 10'
    );
    expect(
      interpolate('{{count}} Vokabeln · Merkmal: {{feature}}', { count: 85, feature: 'Töne' })
    ).toBe('85 Vokabeln · Merkmal: Töne');
  });

  it('lässt unbekannte Platzhalter sichtbar stehen', () => {
    expect(interpolate('Hallo {{name}}', {})).toBe('Hallo {{name}}');
    expect(interpolate('Hallo {{name}}')).toBe('Hallo {{name}}');
  });

  it('wählt Pluralformen nach den Regeln der Sprache (vorher „1 Wörter“)', () => {
    const wort = '{{count, plural, one {# Wort} other {# Wörter}}} für {{was}}';
    expect(interpolate(wort, { count: 1, was: 'heute' }, 'de')).toBe('1 Wort für heute');
    expect(interpolate(wort, { count: 2000, was: 'heute' }, 'de')).toBe('2000 Wörter für heute');
    expect(interpolate('{{n, plural, =0 {nichts} other {# Stück}}}', { n: 0 }, 'de')).toBe('nichts');
    // Russisch: drei Formen für ganze Zahlen.
    expect(translate('ru', 'chapter.words', { count: 1 })).toBe('1 слово для этой главы');
    expect(translate('ru', 'chapter.words', { count: 3 })).toBe('3 слова для этой главы');
    expect(translate('ru', 'chapter.words', { count: 5 })).toBe('5 слов для этой главы');
    expect(translate('ru', 'chapter.words', { count: 21 })).toBe('21 слово для этой главы');
    expect(translate('de', 'backup.partsLog', { days: 1 })).toBe('1 Tag Lernprotokoll');
    // Arabisch: Einzahl, Dual, 3–10, 11–99 (CLDR one/two/few/many).
    expect(translate('ar', 'chapter.words', { count: 2 })).toBe('كلمتان لهذا الفصل');
    expect(translate('ar', 'chapter.words', { count: 5 })).toBe('5 كلمات لهذا الفصل');
    expect(translate('ar', 'chapter.words', { count: 20 })).toBe('20 كلمة لهذا الفصل');
    expect(translate('te', 'home.vocabCount', { count: 1 })).toBe('1 పదం');
    expect(translate('en', 'stress.detailNuclei', { count: 1 })).toMatch(/^1 vowel nucleus\./);
  });

  it('lässt einen Pluralblock ohne Wert sichtbar stehen', () => {
    expect(interpolate('{{count, plural, one {# Wort} other {# Wörter}}}', {}, 'de')).toBe(
      '{{count, plural, one {# Wort} other {# Wörter}}}'
    );
  });
});

describe('Pluralblöcke in allen Wörterbüchern', () => {
  it('sind wohlgeformt und haben immer eine other-Form', () => {
    for (const language of UI_LANGUAGES) {
      for (const [key, template] of Object.entries(dictionaries[language])) {
        if (!template?.includes(', plural,')) continue;
        for (const count of [0, 1, 2, 5, 21]) {
          const text = interpolate(template, { count, cards: count, days: count, total: count, known: count, languages: 'x' }, language);
          expect({ language, key, text }).toEqual({ language, key, text: expect.not.stringMatching(/plural,|[{}]/) });
        }
      }
    }
  });
});

describe('translate — Nachschlagen und Fallback', () => {
  it('übersetzt in jeder Kanon-Sprache', () => {
    expect(translate('de', 'tabs.settings')).toBe('Einstellungen');
    expect(translate('en', 'tabs.settings')).toBe('Settings');
    expect(translate('es', 'tabs.settings')).toBe('Ajustes');
    expect(translate('th', 'tabs.settings')).toBe('ตั้งค่า');
    // ar ist GENERIERT (Pipeline-Job, generate-ui-language.cjs) — der Test
    // erzwingt nur „nicht der deutsche Text“, nicht einen bestimmten Wortlaut.
    expect(translate('ar', 'tabs.settings')).not.toBe('Einstellungen');
    expect(translate('ar', 'tabs.settings').length).toBeGreaterThan(0);
  });

  it('interpoliert auch über t()', () => {
    expect(translate('en', 'cards.progress', { index: 1, total: 5 })).toBe('Card 1 of 5');
  });

  it('fällt bei fehlendem Schlüssel auf Englisch zurück', () => {
    const esDict = dictionaries.es as Record<string, string | undefined>;
    const original = esDict['cards.progress'];
    try {
      delete esDict['cards.progress'];
      expect(translate('es', 'cards.progress', { index: 3, total: 7 })).toBe(
        'Card 3 of 7'
      );
    } finally {
      esDict['cards.progress'] = original;
    }
  });
});

describe('Vollständigkeit der Wörterbücher', () => {
  const referenceKeys = Object.keys(dictionaries.de) as TranslationKey[];

  it('das deutsche Referenz-Set hat überhaupt Schlüssel', () => {
    expect(referenceKeys.length).toBeGreaterThan(100);
  });

  it.each(['en', 'es', 'th', 'ar'] as UiLanguage[])(
    '%s deckt alle Schlüssel ab (fehlende ⊆ FALLBACK_ALLOWED_KEYS)',
    (language) => {
      const missing = referenceKeys.filter(
        (key) => dictionaries[language][key] === undefined
      );
      const unexpected = missing.filter((key) => !FALLBACK_ALLOWED_KEYS.includes(key));
      expect(unexpected).toEqual([]);
    }
  );

  it('kein Wörterbuch führt unbekannte Schlüssel', () => {
    for (const language of UI_LANGUAGES) {
      const unknown = Object.keys(dictionaries[language]).filter(
        (key) => !(key in dictionaries.de)
      );
      expect(unknown).toEqual([]);
    }
  });
});

describe('Sprachnamen und Monate', () => {
  it('gibt zu jeder Lernsprache einen Namen in jeder UI-Sprache', () => {
    for (const target of UI_LANGUAGES) {
      for (const ui of UI_LANGUAGES) {
        // Ohne geprüfte Zelle fällt languageDisplayName aufs Endonym zurück —
        // der Name ist nie leer und nie undefined.
        expect(languageDisplayName(target, ui).length).toBeGreaterThan(0);
      }
    }
    // Produktprinzip: ein Thai sieht Deutsch in thailändischer Schrift.
    expect(languageDisplayName('de', 'th')).toBe('ภาษาเยอรมัน');
    expect(languageDisplayName('th', 'de')).toBe('Thai');
  });

  it('fällt bei ungeprüften Zellen auf das Endonym zurück (Selbstbezeichnung geht immer)', () => {
    // Chinesisch als Anzeige hat keine geprüfte Zeile — das Endonym muss kommen.
    expect(languageDisplayName('zh', 'de')).toBe('中文');
    expect(languageDisplayName('ko', 'zh')).toBe('한국어');
  });
});

describe('React-Anbindung', () => {
  let captured: I18nValue | null;
  let tree: ReactTestRenderer;

  function Probe() {
    captured = useLocale();
    return null;
  }

  beforeEach(() => {
    captured = null;
  });

  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('useLocale ohne Provider nutzt den englischen Default', () => {
    // Die Testumgebung meldet Englisch — der providerlose Fallback darf davon
    // NICHT abhängen, sonst kippen alle deutschfassenden Komponententests.
    mockedGetLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
    act(() => {
      tree = create(createElement(Probe));
    });
    expect(captured?.uiLanguage).toBe('en');
    expect(captured?.t('tabs.settings')).toBe('Settings');
  });

  it('der Provider löst "system" auf die erkannte Systemsprache auf', async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'th', languageTag: 'th-TH' }]);
    mockLoadSetting.mockResolvedValue('system');
    await act(async () => {
      tree = create(
        createElement(I18nProvider, null, createElement(Probe))
      );
    });
    expect(captured?.systemLanguage).toBe('th');
    expect(captured?.uiLanguage).toBe('th');
    expect(captured?.t('tabs.settings')).toBe('ตั้งค่า');
  });

  it('eine gespeicherte Einstellung schlägt die Systemsprache', async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'th', languageTag: 'th-TH' }]);
    mockLoadSetting.mockResolvedValue('es');
    await act(async () => {
      tree = create(
        createElement(I18nProvider, null, createElement(Probe))
      );
    });
    expect(captured?.uiLanguage).toBe('es');
    expect(captured?.t('tabs.settings')).toBe('Ajustes');
  });

  it('setSetting stellt sofort um und speichert im Hintergrund', async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'th', languageTag: 'th-TH' }]);
    mockLoadSetting.mockResolvedValue('system');
    mockSaveSetting.mockResolvedValue(undefined);
    await act(async () => {
      tree = create(
        createElement(I18nProvider, null, createElement(Probe))
      );
    });
    await act(async () => {
      captured?.setSetting('en');
    });
    expect(captured?.setting).toBe('en');
    expect(captured?.uiLanguage).toBe('en');
    expect(mockSaveSetting).toHaveBeenCalledWith('en');
  });

  it('ein Speicherfehler beim Laden verändert die Auflösung nicht', async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'es', languageTag: 'es-ES' }]);
    mockLoadSetting.mockRejectedValue(new Error('Speicher zu'));
    await act(async () => {
      tree = create(
        createElement(I18nProvider, null, createElement(Probe))
      );
    });
    expect(captured?.uiLanguage).toBe('es');
  });
});
