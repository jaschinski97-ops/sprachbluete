import { Tone } from '@/constants/tones';
import { featureFor } from '@/lib/languages/feature';
import { SyllableAnnotation } from '@/lib/languages/types';

import { VocabEntry } from './vocab-types';

/**
 * Eine Silbe, wie die Anzeige sie braucht.
 *
 * SEIT PHASE 16 IST DAS DIE ANNOTATION AUS DEM SPRACHMODELL. Vorher stand hier
 * `{ roman, tone }` mit Pflicht-Ton; damit haette eine spanische Silbe einen
 * Ton tragen muessen, den es nicht gibt.
 */
export type SyllableView = SyllableAnnotation;

/**
 * Die Silben eines Eintrags — Grundlage der Tonfarbcodierung (AE-7).
 *
 * Thai vergibt Töne je Silbe, nicht je Wort: สวัสดี ist `sà-wàt-dii`, also
 * tief-tief-mittel. Die Anzeige muss deshalb `syllables` auswerten.
 *
 * Das einzelne Feld `tone` ist ausdrücklich nur ein **Notnagel** für
 * Altdatensätze, die noch ohne `syllables` gespeichert wurden — etwa Karten,
 * die vor der Einführung von AE-7 im Gerätespeicher gelandet sind. Im
 * Normalfall wird es nicht benutzt.
 */
export function syllablesOf(entry: VocabEntry): SyllableView[] {
  // SEIT PHASE 15 ueber das Sprachmerkmal (Pflicht 3): Welche Silben ein
  // Eintrag hat und wie sie ausgezeichnet sind, weiss die Sprache, nicht
  // diese Datei. Fuer Thai kommt genau dasselbe heraus wie vorher - die
  // Tests aus den Phasen 3, 6 und 13 blieben unveraendert gruen.
  return featureFor(entry).annotate(entry);
}

/**
 * Der Ton des ganzen Wortes — aber nur, wenn alle Silben denselben haben.
 *
 * Sonst `null`: dann darf die Thai-Schrift nicht in einer einzigen Tonfarbe
 * eingefärbt werden, weil das über die Hälfte des Wortes die Unwahrheit sagen
 * würde. Die Silbenfarben stehen in dem Fall an der Umschrift.
 */
export function uniformTone(entry: VocabEntry): Tone | null {
  const syllables = syllablesOf(entry);
  const first = syllables[0]?.tone;
  if (!first) return null;
  return syllables.every((syllable) => syllable.tone === first) ? first : null;
}

export function isMultiSyllable(entry: VocabEntry): boolean {
  return syllablesOf(entry).length > 1;
}
