import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Platform } from 'react-native';

import ar from './dictionaries/ar';
import bn from './dictionaries/bn';
import de from './dictionaries/de';
import en from './dictionaries/en';
import es from './dictionaries/es';
import fr from './dictionaries/fr';
import hi from './dictionaries/hi';
import pt from './dictionaries/pt';
import th from './dictionaries/th';
import zh from './dictionaries/zh';
import type { TranslationKey } from './keys';
import { detectSystemLocale } from './detect';
import { loadLanguageSetting, saveLanguageSetting } from './prefs';
import type { LanguageSetting, TParams, UiLanguage } from './types';
import { DEFAULT_UI_LANGUAGE, SYSTEM_LANGUAGE_SETTING } from './types';

export type { LanguageSetting, TParams, UiLanguage } from './types';
export type { TranslationKey } from './keys';
export {
  DEFAULT_UI_LANGUAGE,
  SYSTEM_LANGUAGE_SETTING,
  UI_LANGUAGES,
  normalizeLanguageCode,
  normalizeLanguageSetting,
} from './types';
export { detectSystemLocale } from './detect';
export { loadLanguageSetting, saveLanguageSetting } from './prefs';

/**
 * Internationalisierung der App-UI (Roadmap v2, Phase 1).
 *
 * PRINZIP: Die App erscheint in der SYSTEMSPRACHE des Geräts — sie ist
 * zugleich die künftige „Brückensprache“ des Lerners. In den Einstellungen
 * lässt sie sich fest einschalten; solange nicht, gilt `'system'`.
 *
 * AUFBAU:
 *   `dictionaries`   — de (Referenz) + 19 Übersetzungen; en/es sind geprüft,
 *                       die übrigen GENERIERT via
 *                       scripts/content/generate-ui-language.cjs (ar war der
 *                       Pilot, seit 13.09.2026 sind es 20 App-Sprachen)
 *   `translate()`    — Nachschlagen mit de-Fallback, `{{name}}`-Interpolation
 *   `I18nProvider`   — lädt die Einstellung und hält sie im Context
 *   `useLocale()`    — Zugang für Screens/Komponenten; ohne Provider
 *                      (etwa im Test) gilt die erkannte Systemsprache
 */

export const dictionaries: Record<UiLanguage, Partial<Record<TranslationKey, string>>> = {
  ar,
  bn,
  de,
  en,
  es,
  fr,
  hi,
  pt,
  th,
  zh,
};

/**
 * Schlüssel, für die ein deutscher Fallback ausdrücklich zugelassen ist.
 *
 * Der Vollständigkeitstest verlangt: fehlende Keys ⊆ diese Liste. SEIT DEM
 * 21.09.2026 WIEDER LEER: Die Chrome-Schlüssel des Anker-Umbaus (audio.*,
 * drill.*, stress.*, grammar.*, consonantClass.*, palette.*, termWord.*,
 * dictation.msg*) stehen in ALLEN 20 Wörterbüchern — die 16 generierten
 * über den Merge-Modus des Generierungsskripts
 * (`generate-ui-language.cjs <code> --fehlende`, nur die Differenz, Bestand
 * bytegleich erhalten), es/th/de/en von Hand. Kein deutscher Rest anywhere.
 */
export const FALLBACK_ALLOWED_KEYS: readonly TranslationKey[] = [];

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;
const PLURAL_START = /\{\{(\w+), plural,/g;

const pluralRules = new Map<string, Intl.PluralRules | null>();

/** CLDR-Kategorie (one, few, many …) — ohne `Intl.PluralRules` nur one/other. */
function pluralCategory(language: string, value: number): string {
  if (!pluralRules.has(language)) {
    try {
      pluralRules.set(language, new Intl.PluralRules(language));
    } catch {
      pluralRules.set(language, null);
    }
  }
  return pluralRules.get(language)?.select(value) ?? (value === 1 ? 'one' : 'other');
}

/**
 * Pluralformen als ICU-Teilmenge: `{{count, plural, one {# Wort} other {# Wörter}}}`.
 * Vorher stand überall eine feste Form („1 Wörter“, russisch „5 слоговых
 * ядра“). Die Kategorie wählt `Intl.PluralRules` der Oberflächensprache,
 * `=0`/`=1` … treffen genau, `#` ist die Zahl, ohne passende Kategorie gilt
 * `other`. Ein Block ohne Wert bleibt wie `{{name}}` sichtbar stehen.
 */
function resolvePlurals(template: string, params: TParams, language: string): string {
  let out = '';
  let pos = 0;
  for (const match of template.matchAll(PLURAL_START)) {
    const start = match.index;
    if (start < pos) continue;
    const branches = new Map<string, string>();
    let i = start + match[0].length;
    for (;;) {
      while (template[i] === ' ') i++;
      if (template.startsWith('}}', i)) {
        i += 2;
        break;
      }
      const open = template.indexOf('{', i);
      if (open < 0) return template;
      let depth = 1;
      let j = open + 1;
      for (; j < template.length && depth > 0; j++) {
        if (template[j] === '{') depth++;
        else if (template[j] === '}') depth--;
      }
      if (depth !== 0) return template;
      branches.set(template.slice(i, open).trim(), template.slice(open + 1, j - 1));
      i = j;
    }
    const name = match[1];
    if (!Object.prototype.hasOwnProperty.call(params, name)) continue;
    const value = Number(params[name]);
    const chosen =
      (Number.isFinite(value)
        ? branches.get(`=${value}`) ?? branches.get(pluralCategory(language, value))
        : undefined) ?? branches.get('other') ?? '';
    out += template.slice(pos, start) + chosen.replace(/#/g, String(params[name]));
    pos = i;
  }
  return out + template.slice(pos);
}

/**
 * Ersetzt `{{name}}` durch die übergebenen Werte. Ein Platzhalter ohne Wert
 * bleibt stehen — eine fehlende Variable soll sichtbar sein, nicht still
 * leeren, was der Nutzer lesen soll. Pluralblöcke siehe `resolvePlurals`.
 */
export function interpolate(template: string, params?: TParams, language: string = 'en'): string {
  if (!params) return template;
  const resolved = template.includes(', plural,') ? resolvePlurals(template, params, language) : template;
  return resolved.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/** Ein Schlüssel in einer Sprache — bei Fehlbestand auf Deutsch zurückfallend. */
export function translate(language: UiLanguage, key: TranslationKey, params?: TParams): string {
  const template = dictionaries[language][key] ?? en[key] ?? de[key];
  return interpolate(template, params, language);
}

/* ---------- Anzeigename einer Lernsprache ---------- */

/**
 * Jedes Lernziel erscheint in der Sprache der Oberfläche: Ein Deutscher sieht
 * „Thai“, ein Thai sieht „ภาษาเยอรมัน“ (deutsch). Der ERSTE Index ist die
 * Lernsprache, der ZWEITE die UI-Sprache.
 *
 * SEIT DEM 20-SPRACHEN-AUSBAU (13.09.2026) NUR NOCH DIE GEPRÜFTEN ZELLEN: Die
 * Zeilen der vier Lernsprachen (de/en/es/th) und der ar-Pilotzeile stehen
 * vollständig da, wo sie gebraucht werden; alle übrigen Kombinationen fallen
 * per `languageDisplayName` auf das ENDONYM zurück — die sichere
 * Selbstbezeichnung, die in jeder Oberfläche lesbar bleibt. 400 handgesetzte
 * Zellen wären eine Fehlerquelle ohne Gegenwert; wer Zellen nachtragen will,
 * erweitert die Tabelle hier zeilenweise.
 */
export const LANGUAGE_DISPLAY_NAMES: Partial<Record<UiLanguage, Partial<Record<UiLanguage, string>>>> = {
  ar: { ar: 'العربية', de: 'Arabisch', en: 'Arabic', es: 'árabe', th: 'ภาษาอาหรับ' },
  de: {
    ar: 'الألمانية', bn: 'জার্মান', de: 'Deutsch', en: 'German', es: 'alemán',
    fr: 'allemand', hi: 'जर्मन',
    pt: 'alemão',
    th: 'ภาษาเยอรมัน', zh: '德语',
  },
  en: {
    ar: 'الإنجليزية', bn: 'ইংরেজি', de: 'Englisch', en: 'English', es: 'inglés',
    fr: 'anglais', hi: 'अंग्रेज़ी',
    pt: 'inglês',
    th: 'ภาษาอังกฤษ', zh: '英语',
  },
  es: {
    ar: 'الإسبانية', bn: 'স্প্যানিশ', de: 'Spanisch', en: 'Spanish', es: 'español',
    fr: 'espagnol', hi: 'स्पेनिश',
    pt: 'espanhol',
    th: 'ภาษาสเปน', zh: '西班牙语',
  },
  fr: {
    ar: 'الفرنسية', bn: 'ফরাসি', de: 'Französisch', en: 'French', es: 'francés',
    fr: 'français', hi: 'फ़्रेंच',
    pt: 'francês',
    th: 'ภาษาฝรั่งเศส', zh: '法语',
  },
  th: {
    ar: 'التايلاندية', bn: 'থাই', de: 'Thai', en: 'Thai', es: 'tailandés',
    fr: 'thaï', hi: 'थाई',
    pt: 'tailandês',
    th: 'ภาษาไทย', zh: '泰语',
  },
};

/** Endonyme der App-Sprachen — die Fallback- und Auswahl-Form. */
export const LANGUAGE_ENDONYME: Record<UiLanguage, string> = {
  ar: 'العربية',
  bn: 'বাংলা',
  de: 'Deutsch',
  en: 'English',
  es: 'español',
  fr: 'français',
  hi: 'हिन्दी',
  pt: 'português',
  th: 'ภาษาไทย',
  zh: '中文',
};

/**
 * Anzeigename einer Lernsprache in der aktuellen UI-Sprache — ohne Eintrag in
 * der geprüften Matrix das Endonym (die Selbstbezeichnung, die überall geht).
 */
export function languageDisplayName(target: UiLanguage, ui: UiLanguage): string {
  return LANGUAGE_DISPLAY_NAMES[target]?.[ui] ?? LANGUAGE_ENDONYME[target];
}

/** Sprachtag für Datumsformatierung (etwa `toLocaleDateString`). */
export function localeTagFor(language: UiLanguage): string {
  switch (language) {
    case 'ar':
      // Ägypten ist die Pilot-Region der arabischen Oberfläche.
      return 'ar-EG';
    case 'bn':
      return 'bn-IN';
    case 'de':
      return 'de-DE';
    case 'en':
      return 'en-GB';
    case 'es':
      return 'es-ES';
    case 'fr':
      return 'fr-FR';
    case 'hi':
      return 'hi-IN';
    case 'pt':
      return 'pt-BR';
    case 'th':
      return 'th-TH';
    case 'zh':
      return 'zh-CN';
  }
}

/* ---------- React-Anbindung ---------- */

export type I18nValue = {
  /** Was eingestellt ist: eine feste Sprache oder `'system'`. */
  setting: LanguageSetting;
  /** Die Sprache, in der die UI gerade erscheint (aufgelöst). */
  uiLanguage: UiLanguage;
  /** Die erkannte Systemsprache des Geräts. */
  systemLanguage: UiLanguage;
  /** Übersetzen mit Interpolation — nur bekannte Schlüssel. */
  t: (key: TranslationKey, params?: TParams) => string;
  /** Anzeigename einer Lernsprache in der aktuellen UI-Sprache. */
  languageName: (target: UiLanguage) => string;
  /** Einstellung ändern (wird sofort persistiert). */
  setSetting: (setting: LanguageSetting) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

/** Wechsel der App-Sprache mit `prepare`, nacheinander (eine App, ein Provider). */
let uiQueue: Promise<void> = Promise.resolve();

function buildValue(
  setting: LanguageSetting,
  systemLanguage: UiLanguage,
  setSetting?: (setting: LanguageSetting) => void
): I18nValue {
  const uiLanguage = setting === SYSTEM_LANGUAGE_SETTING ? systemLanguage : setting;
  return {
    setting,
    uiLanguage,
    systemLanguage,
    t: (key, params) => translate(uiLanguage, key, params),
    languageName: (target) => languageDisplayName(target, uiLanguage),
    setSetting:
      setSetting ??
      (() => {
        // Ohne Provider (Testumgebung) gibt es nichts zu persistieren.
      }),
  };
}

/**
 * Hängt die App-Sprache an den Komponentenbaum.
 *
 * Beim Mount ist die erkannte Systemsprache aktiv; parallel liest der Effekt
 * die gespeicherte Einstellung und stellt — wenn vorhanden — um. Speicherfehler
 * werden bewusst geschluckt: Fehlt der Speicherstand, ist `'system'` ohnehin
 * der richtige Stand.
 */
export function I18nProvider({
  children,
  prepare,
}: {
  children: ReactNode;
  /**
   * Wird vor jeder (auch der ersten) App-Sprache abgewartet, bevor die
   * Oberfläche sie zeigt — im App-Build lädt `_layout.tsx` hier die
   * Übersetzungsteile des Katalogs (Katalog je Lernsprache, Schritt 1b).
   * Ein Fehler hält die Umstellung nicht auf.
   */
  prepare?: (ui: UiLanguage) => Promise<void>;
}) {
  // NULL bis der Speicherstand da ist: Der erste Render wartet, statt die
  // App kurz in der Fallback-Sprache aufblitzen zu lassen (Kaltstart-Blitz,
  // Nutzerbefund 21.09.). Der Ladevorgang ist derselbe Speicher, den das
  // Profil eh liest — die Verzögerung ist die erste weiße Sekunde.
  const [setting, setSettingState] = useState<LanguageSetting | null>(null);
  const systemLanguage = useMemo(() => detectSystemLocale(), []);
  // Mit `prepare` wird jede Sprache erst vorbereitet und dann gesetzt — der
  // Reihe nach, damit bei schnellen Wechseln die zuletzt gewählte gewinnt.
  const apply = useCallback(
    (next: LanguageSetting, isCurrent: () => boolean = () => true) => {
      if (!prepare) {
        if (isCurrent()) setSettingState(next);
        return;
      }
      const ui = next === SYSTEM_LANGUAGE_SETTING ? systemLanguage : next;
      uiQueue = uiQueue
        .then(() => prepare(ui))
        .catch((error: unknown) => console.warn('[i18n] App-Sprache vorbereiten:', error))
        .then(() => {
          if (isCurrent()) setSettingState(next);
        });
    },
    [prepare, systemLanguage]
  );

  useEffect(() => {
    let cancelled = false;
    loadLanguageSetting()
      // Ohne Speicherstand gilt das System — wie beim Initialwert.
      .catch(() => SYSTEM_LANGUAGE_SETTING)
      .then((stored) => apply(stored, () => !cancelled));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const setSetting = useCallback((next: LanguageSetting) => {
    apply(next);
    saveLanguageSetting(next).catch(() => {
      // Fire-and-forget wie die Profil-Setter; der Screen-Zustand stimmt gleich.
    });
  }, [apply]);

  const value = useMemo(
    () => buildValue(setting ?? SYSTEM_LANGUAGE_SETTING, systemLanguage, setSetting),
    [setting, systemLanguage, setSetting]
  );

  // RTL (Web-Pilot): Die arabische Oberfläche läuft von rechts nach links —
  // gesetzt am Dokument, damit das GANZE Layout (nicht nur Textabsätze) die
  // Laufrichtung erbt. Bewusst nur im Web: I18nManager-RTL auf nativ braucht
  // einen App-Neustart und eine eigene Layout-Prüfung aller Screens (Stufe 2,
  // ausstehend) — nativ bleibt die Laufrichtung LTR.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.dir = value.uiLanguage === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = value.uiLanguage;
  }, [value.uiLanguage]);

  // Ohne geladenen Stand noch nichts rendern — der Host-Splash bleibt
  // stehen, und danach erscheint die App direkt in der richtigen Sprache.
  if (setting === null) return null;
  return createElement(I18nContext.Provider, { value }, children);
}

/**
 * Zugang zur App-Sprache.
 *
 * Auch OHNE Provider brauchbar (etwa in Komponententests): Dort gilt die
 * Referenzsprache Deutsch — deterministisch, damit Tests deutscher Beschriftungen
 * nicht von der Sprachauskunft der Testumgebung abhängen. Die App selbst hängt
 * den Provider in `_layout.tsx` ein; die Erkennung der Systemsprache passiert
 * dort und nur dort.
 */
export function useLocale(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) return buildValue(SYSTEM_LANGUAGE_SETTING, DEFAULT_UI_LANGUAGE);
  return ctx;
}
