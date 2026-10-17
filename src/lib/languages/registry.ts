import { activeVocabularyFor } from '@/data/active-vocabulary';
import { languageDisplayName, type UiLanguage } from '@/lib/i18n';

import { LEARNING_LANGUAGES } from './definitions';

import {
  Direction,
  directionsFor,
  Lang,
  LANGUAGE_CODES,
  LanguageCode,
  LanguageDefinition,
} from './types';

/**
 * Die Lernsprachen mit Laufzeitangaben (Bestand) — gebaut aus der EINEN
 * Definition in `definitions.ts`. Hier nichts sprachspezifisch nachtragen.
 */
export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = Object.fromEntries(
  LANGUAGE_CODES.map((code) => {
    const def = LEARNING_LANGUAGES[code];
    const definition: LanguageDefinition = {
      code,
      label: def.label,
      endonym: def.endonym,
      speechLocale: def.speechLocale,
      challenge: def.challenge,
      feature: def.feature,
      get entryCount() { return activeVocabularyFor(code).length; },
      delivered: true,
      hasGermanModules: true,
    };
    return [code, definition];
  })
) as Record<LanguageCode, LanguageDefinition>;

export const DEFAULT_LANGUAGE: LanguageCode = 'th';

/** Reihenfolge in der Auswahl: die Vorgabe zuerst, dann alphabetisch. */
export const LANGUAGE_ORDER: LanguageCode[] = [...LANGUAGE_CODES].sort((a, b) => {
  if (a === DEFAULT_LANGUAGE) return -1;
  if (b === DEFAULT_LANGUAGE) return 1;
  const byContent = Number(LANGUAGES[b].entryCount > 0) - Number(LANGUAGES[a].entryCount > 0);
  return byContent !== 0 ? byContent : LANGUAGES[a].label.localeCompare(LANGUAGES[b].label);
});

export function languageOf(code: LanguageCode): LanguageDefinition {
  return LANGUAGES[code];
}

/**
 * Ist diese Sprache überhaupt lernbar, oder steht sie nur in der Liste?
 *
 * SEIT DEM PAARMATRIX-MODELL EINE ZWEI TEILIGE FRAGE: `entryCount > 0`
 * heißt „geprüfter Stoff liegt vor“, `delivered` heißt „er ist auf jedem
 * Gerät“. Erst beides zusammen macht eine Sprache wählbar — ein Grundstoff
 * ohne Auslieferung wäre eine leere Versprechung.
 */
export function hasContent(code: LanguageCode): boolean {
  return LANGUAGES[code].entryCount > 0 && LANGUAGES[code].delivered;
}

export function languagesWithContent(): LanguageDefinition[] {
  return LANGUAGE_ORDER.map(languageOf).filter((language) => language.entryCount > 0);
}

/** Die Standardsprache — die Vorgabe, solange sie Inhalte hat. */
export function defaultLanguage(): LanguageCode {
  if (hasContent(DEFAULT_LANGUAGE)) return DEFAULT_LANGUAGE;
  // Die Liste kommt aus LANGUAGE_ORDER und damit aus LANGUAGE_CODES — der
  // erste Code ist deshalb immer einer aus dem Bestand, nie das (noch nicht
  // ausgelieferte) Französisch.
  return (languagesWithContent()[0]?.code ?? DEFAULT_LANGUAGE) as LanguageCode;
}

/**
 * Beschriftung einer Richtung, aus dem Verzeichnis gebaut statt als Tabelle
 * gepflegt — sonst müsste jede neue Sprache an zwei Stellen nachgetragen
 * werden, und eine davon würde vergessen.
 *
 * SEIT DEM i18N-GERÜST MEHRSPRACHIG: Die Namen kommen aus
 * `LANGUAGE_DISPLAY_NAMES`, also in der Sprache der OBERFLÄCHE — ein
 * Thailänder sieht „ไทย → ภาษาเยอรมัน”. Ohne Angabe gilt Deutsch (die
 * Referenzsprache): Der providerlose Fall — Tests und Aufrufer ohne
 * UI-Kontext — bleibt damit exakt so, wie er war. Wer die aktive
 * UI-Sprache kennt (`useLocale().uiLanguage`), reicht sie durch.
 */
export function directionLabel(direction: Direction, ui: UiLanguage = 'de'): string {
  const [quelle, ziel] = direction.split('_to_') as [LanguageCode, LanguageCode];
  return `${languageDisplayName(quelle, ui)} → ${languageDisplayName(ziel, ui)}`;
}

// `directionPrompt` gab es bis Phase 18: ein Satz wie „Deutsch lesen, das Wort
// auf Thai abrufen". Er stand auf jeder Richtungskarte und sagte nichts, was
// die Beschriftung „Deutsch → Thai" nicht schon sagt. An seine Stelle ist im
// Lernen-Reiter die Liste der Fertigkeiten getreten - die Angabe, nach der man
// wirklich auswaehlt.

export { directionsFor };

/**
 * Beschriftung aller fünf Kanon-Sprachen — Deutsch inklusive.
 *
 * DER GRUND FÜR DIE KLEINE TABELLE: Deutsch ist keine Ziel-Sprache mit
 * Grundstoff (`LANGUAGE_CODES`), taucht aber auf jeder Seite eines Paars auf.
 * Ein `Record<Lang, string>` hält die Beschriftung an **einer** Stelle, und
 * `pairLabel` liest sie, statt Deutsch zu hartkodieren.
 */
export const LANGUAGE_LABELS: Record<Lang, string> = Object.fromEntries(
  LANGUAGE_CODES.map((code) => [code, LEARNING_LANGUAGES[code].label])
) as Record<Lang, string>;

/** Alle 20 Paare des Kanons — aus `types.ts` hier nur weitergereicht. */
export { PAIRS as ALL_PAIRS } from './types';
