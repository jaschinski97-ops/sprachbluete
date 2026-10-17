import { VocabEntry } from '@/data/vocab-types';

import { DrillId } from '../drills/types';

import { LEARNING_LANGUAGES } from './definitions';
import { LANGUAGES } from './registry';
import {
  targetLanguageOf,
  PairDirection,
  SyllableAnnotation,
  Lang,
  LanguageCode,
} from './types';

/**
 * Der einhängbare Teil des Sprachmerkmals (Phase 15, Pflicht 3).
 *
 * `types.ts` beschreibt ein Merkmal (Name, Art, Quelle). Hier steht, was es
 * **tut** — und zwar genau zweierlei, weil die App genau zweierlei davon
 * braucht:
 *
 *   1. `annotate` — die Silbenaufteilung mit ihrer Auszeichnung. Bei Thai sind
 *      das Umschrift und Ton je Silbe, und daraus baut `ThaiWord` seine
 *      Farben. Für Spanisch wäre es später Silbe und Betonung, für Englisch
 *      die Lautschrift.
 *   2. `drills` — welche Übungen zum Merkmal gehören, im Unterschied zu den
 *      deutschen Grammatikübungen, die zu jedem Paar gehören (Pflicht 6).
 *
 * WAS HIER BEWUSST NICHT STEHT: Farben, Glyphen, Schriftregeln. Die bleiben
 * in `constants/tones.ts` und `data/thai-script.ts`. Ein Merkmal liefert die
 * **Auszeichnung**, nicht ihre Darstellung — sonst entstünde ein zweites
 * Darstellungssystem neben dem in Phase 9 kontrastgeprüften, und genau das
 * verbietet Pflicht 3.
 *
 * NACHWEIS AM BESTAND: Thai läuft unverändert hier durch. `syllablesOf` in
 * `data/vocab-helpers.ts` ruft `annotate`, und alle Thai-Tests aus den Phasen
 * 3, 6 und 13 blieben ohne eine einzige Änderung grün.
 */

/** Bereits publizierte ES-Daten verwenden teilweise den alten Alias. */
export function normalizedSyllables(entry: VocabEntry): SyllableAnnotation[] {
  return (entry.syllables ?? []).map(syllable => ({
    ...syllable,
    roman: syllable.roman ?? (syllable as SyllableAnnotation & { syllable?: string }).syllable ?? (syllable as SyllableAnnotation & { text?: string }).text ?? '',
  }));
}

// Der Typ steht seit Phase 16 in `types.ts` - der Vokabeltyp braucht ihn,
// und von hier aus waere es ein Zirkel.
export type { SyllableAnnotation };

export type LanguageFeatureRuntime = {
  /**
   * Wie ein Eintrag in ausgezeichnete Silben zerfällt. Fällt auf eine einzige
   * Silbe zurück, wenn das Merkmal für diesen Eintrag nichts hergibt.
   */
  annotate(entry: VocabEntry): SyllableAnnotation[];
  /** Die Übungen, die zum Merkmal gehören (nicht die deutschen). */
  drills: DrillId[];
};

/**
 * Thai: Töne je Silbe (AE-7) und die beiden Ton-Übungen aus Phase 6 und 13.
 *
 * `syllables` ist maßgeblich; das einzelne Feld `tone` bleibt der Notnagel für
 * Datensätze aus der Zeit vor AE-7.
 */
/**
 * Die Silbenauszeichnung je Schrift/Merkmal. Neue Lernsprachen brauchen hier
 * NICHTS: Ohne eigenen Eintrag gilt `GENERISCH` (Silben, sonst Lautschrift,
 * sonst Umschrift). Die Übungen je Sprache stehen in `definitions.ts`.
 */
type Annotator = (entry: VocabEntry) => SyllableAnnotation[];

const GENERISCH: Annotator = (entry) => {
  if (entry.syllables && entry.syllables.length > 0) return normalizedSyllables(entry);
  return [{ roman: entry.ipa ?? entry.romanization ?? entry.term }];
};

const ANNOTATOREN: Partial<Record<Lang, Annotator>> = {
  th: (entry) => {
    if (entry.syllables && entry.syllables.length > 0) return normalizedSyllables(entry);
    return [{ roman: entry.romanization, tone: entry.tone }];
  },
  es: (entry) => {
    if (entry.syllables && entry.syllables.length > 0) return normalizedSyllables(entry);
    return [{ roman: entry.romanization || entry.term }];
  },
  en: (entry) => [{ roman: entry.ipa ?? entry.romanization ?? entry.term }],
  de: (entry) => [{ roman: entry.romanization || entry.term }],
};

export function featureRuntime(language: LanguageCode): LanguageFeatureRuntime {
  return {
    annotate: ANNOTATOREN[language] ?? GENERISCH,
    drills: [...LEARNING_LANGUAGES[language].drills],
  };
}

export function featureFor(entry: VocabEntry): LanguageFeatureRuntime {
  return featureRuntime(entry.language);
}

/** Die sprachspezifischen Übungen einer Richtung — die der ZIELsprache. */
export function drillsForDirectionViaFeature(direction: PairDirection): DrillId[] {
  const language = targetLanguageOf(direction);
  if (!LANGUAGES[language].feature.implemented) return [];
  return featureRuntime(language).drills;
}

export function featureIsImplemented(language: LanguageCode): boolean {
  return LANGUAGES[language].feature.implemented;
}
