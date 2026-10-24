/**
 * Die App-Sprachen (Oberfläche UND Brücke, Roadmap v2 Phase 1).
 *
 * SEIT DEM 20-SPRACHEN-AUSBAU (13.09.2026, Nutzerwunsch: „die 20 meist-
 * gesprochenen Sprachen der Welt“ in den SPRACHEINSTELLUNGEN): die drei
 * geprüften Oberflächen (de Referenz, en/es) plus der ar-Pilot plus die 15
 * KI-generierten Heimatsprachen — 20 Sprachen insgesamt, deren Wörterbücher
 * die Pipeline (`scripts/content/generate-ui-language.cjs`) aus de.ts
 * übersetzt. Die vier LERNsprachen (th/en/es/de als Ziele) bleiben von
 * dieser Liste unberührt; sie ist die Frage „in welcher Sprache liest man
 * die App“, nicht „was lernt man“.
 *
 * Bewusst EIN flacher Sprachkanon für UI und Brücke.
 *
 * SEIT 24.10.2026 ZEHN SPRACHEN (Nutzerentscheidung): Deutsch und Thai plus die
 * meistgesprochenen Sprachen der Welt. ru, ur, id, ja, mr, te, tr, ta, vi und
 * ko sind entfernt (Wörterbücher in der Git-Historie); deren Systemsprache
 * fällt auf Englisch zurück.
 */
export const UI_LANGUAGES = [
  'de',
  'en',
  'es',
  'th',
  'ar',
  'zh',
  'hi',
  'fr',
  'bn',
  'pt',
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** Die Sprache, die gilt, solange nichts anderes gewählt ist. */
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';

/** Einstellung in den Einstellungen: eine feste Sprache oder das System. */
export type LanguageSetting = UiLanguage | 'system';

export const SYSTEM_LANGUAGE_SETTING = 'system' as const;

/** Werte, die `t(key, params)` in `{{name}}`-Platzhalter einsetzt. */
export type TParams = Record<string, string | number>;

function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Ein roher Sprachcode (etwa `getLocales()[0].languageCode`) wird auf den
 * Kanon normiert; alles Unbekannte fällt auf die Vorgabe zurück.
 *
 * Bewusst nur der SPRACHcode, keine Region: `de-AT` und `de-CH` sind Deutsch.
 * SEIT DEM 20-SPRACHEN-AUSBAU ALLGEMEIN: `getLocales()` liefert je nach
 * Plattform den Sprachcode ODER den vollen BCP-47-Tag — beides muss dieselbe
 * Oberfläche ergeben. Deshalb fällt ein unbekannter voller Tag auf seinen
 * Basis-Subtag zurück (`ar-EG` → `'ar'`, `pt-BR` → `'pt'`, `zh-TW` → `'zh'`);
 * mit dem früheren ar-Einzel-Sonderfall wären Portugiesisch & Co. still
 * auf Deutsch gefallen.
 */
export function normalizeLanguageCode(value: unknown): UiLanguage {
  if (typeof value === 'string') {
    if (isUiLanguage(value)) return value;
    // Bewusst OHNE Groß-/Kleinsonderung — derselbe Vertrag wie oben:expo-localization
    // liefert Kleinschreibung, 'FR' bleibt ein Fremdformat.
    const basis = value.split('-')[0];
    if (basis && isUiLanguage(basis)) return basis;
  }
  return DEFAULT_UI_LANGUAGE;
}

/**
 * Eine gespeicherte Einstellung wird nachsichtig gelesen: alles, was nicht
 * `'system'` oder ein Kanon-Code ist, ergibt wieder `'system'` — ein Wert aus
 * einer älteren Version darf die App nie in einer falschen Sprache sperren.
 */
export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  if (value === SYSTEM_LANGUAGE_SETTING) return SYSTEM_LANGUAGE_SETTING;
  return isUiLanguage(value) ? value : SYSTEM_LANGUAGE_SETTING;
}
