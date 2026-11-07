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

/** Genus-Block des Nomens in seiner Lernsprache (Deutsch, Spanisch, Französisch, Portugiesisch, Italienisch). */
export function nounOf(entry: VocabEntry): { article: string; plural: string } | undefined {
  if (entry.language === 'de') return entry.germanNoun;
  if (entry.language === 'es') return entry.spanishNoun;
  if (entry.language === 'fr') return entry.frenchNoun;
  if (entry.language === 'pt') return entry.portugueseNoun;
  if (entry.language === 'it') return entry.italianNoun;
  return undefined;
}

/**
 * Das Wort mit seinem Artikel, wie Karte und Wortliste es zeigen („der Hund“,
 * „la casa“, „l’arbre“). Steht der Artikel schon im Wort, bleibt es, wie es ist.
 */
export function termWithArticle(entry: VocabEntry): string {
  const noun = nounOf(entry);
  if (!noun) return entry.term;
  const lower = entry.term.toLowerCase();
  // „l’“ (Französisch, Italienisch) hängt ohne Leerzeichen am Wort; die anderen Artikel stehen davor.
  if (noun.article === 'l’') return lower.startsWith('l’') || lower.startsWith("l'") ? entry.term : `l’${entry.term}`;
  return lower.startsWith(`${noun.article} `) ? entry.term : `${noun.article} ${entry.term}`;
}
