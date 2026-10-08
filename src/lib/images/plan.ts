import { VocabEntry } from '@/data/vocab-types';
import { activeVocabulary, activeVocabularyFor as vocabularyFor } from '@/data/active-vocabulary';

import { LanguageCode } from '../languages/types';

import { assertUniqueIds, limitPlan } from '../generation/plan';

import { hasMotif, motifFor, motifKey } from './motifs';
import { ImageSpec } from './types';

/**
 * Der Bauplan eines Bilderlaufs — und zugleich das Tor, das abstrakte
 * Einträge draußen hält (AE-15).
 *
 * Anders als bei den Sprachsituationen entsteht der Plan nicht aus einem
 * Kreuzprodukt, sondern aus dem vorhandenen Vokabel-Grundstock: **je Vokabel
 * höchstens ein Bild**, und nur, wenn `isConcrete` gesetzt ist. Die
 * Reihenfolge folgt der Datei `data/vocabulary.ts` und ist damit
 * deterministisch — ein Probelauf trifft zweimal dieselben Einträge und
 * bezahlt beim Fortsetzen nichts doppelt.
 */

/** Ein kleiner, bezahlbarer Probelauf. */
export const IMAGE_TEST_RUN = 5;

export function canHaveImage(entry: VocabEntry): boolean {
  // Seit Phase 16 zusaetzlich: ein Motiv muss vorliegen. Fuer Englisch und
  // Spanisch kommt es ueber den gemeinsamen Begriff aus dem Thai-Eintrag
  // (AE-46); wo keines hinterlegt ist, gibt es kein Bild statt eines
  // geratenen.
  return entry.isConcrete === true && (hasMotif(motifKey(entry)) || entry.id.startsWith('ki-'));
}

/**
 * Baut den Auftrag für eine Vokabel — und wirft, wenn sie nicht konkret ist.
 *
 * Erste von drei Sperren: hier, in `imageTask.produce` vor dem Netzaufruf und
 * im API-Client selbst. Dreifach, weil eine einzelne Sperre irgendwann durch
 * einen neuen Aufrufer umgangen wird; das Tor soll aber an keiner Stelle
 * passierbar sein.
 */
export function imageSpecFor(entry: VocabEntry): ImageSpec {
  if (!canHaveImage(entry)) {
    throw new Error(
      `"${entry.id}" (${entry.german}) ist nicht konkret — für diesen Eintrag wird ` +
        'kein Bild erzeugt.'
    );
  }
  return {
    id: entry.id,
    vocabId: entry.id,
    thai: entry.term,
    romanization: entry.romanization,
    german: entry.german,
    partOfSpeech: entry.partOfSpeech,
    // Wirft, wenn kein Motiv hinterlegt ist - lieber ein sichtbarer Fehler
    // beim Planen als ein geratenes Bild.
    motif: hasMotif(motifKey(entry)) ? motifFor(motifKey(entry)) : generatedMotif(entry),
    isConcrete: true,
  };
}

/**
 * Motiv für KI-Vokabeln ohne handgeschriebenes Motiv — auf Englisch.
 *
 * Bildprüfung 04.10.2026: Der frühere Ersatz „depiction of <deutsche
 * Bedeutung> (<Zielwort>)" lieferte bei FLUX klein Fruchtgesichter, Porträts
 * und Kugeln („Bett (เตียง)" → Gesicht). Deshalb die englische Übersetzung
 * und eine Szene je Wortart: Handlungen brauchen jemanden, der sie ausführt,
 * Eigenschaften ein Ding, an dem man sie sieht.
 */
export function generatedMotif(entry: VocabEntry): string {
  // Ohne Anführungszeichen: Ein zitiertes Wort malt FLUX als Schriftzug ins
  // Bild ("Bill", "Exit"). Die Übersetzung steht deshalb nur im Satz.
  const english = (entry.translations?.en ?? (entry.language === 'en' ? entry.term : entry.german)).trim();
  const noFiller = 'No face, mascot or cartoon character unless the subject is a person or an animal.';
  const noWriting = 'Show it purely as a picture; never write the word, a sign or a label.';
  switch (entry.partOfSpeech) {
    case 'verb': {
      const action = english.replace(/^to\s+/i, '').replace(/,\s*to\s+/gi, ', ');
      return `A scene where one or two people are clearly in the middle of the action to ${action}, ` +
        `together with every object the action needs, so the action is obvious at a glance. ${noWriting}`;
    }
    case 'adjective':
    case 'adverb':
      return `A typical everyday object whose most obvious feature is that it is ${english}, ` +
        `exaggerated so it cannot be mistaken. ${noFiller} ${noWriting}`;
    default:
      return `A typical ${english} as it looks in everyday life, whole and instantly recognizable; ` +
        `for a place or a group, the typical scene. ${noFiller} ${noWriting}`;
  }
}

/**
 * Prüft einen Auftrag noch einmal gegen den Grundstock.
 *
 * Nötig, weil ein `ImageSpec` auch aus dem Speicher oder aus altem Code
 * kommen kann; dort ist der Literaltyp `isConcrete: true` längst verloren.
 */
export function assertConcreteSpec(spec: ImageSpec): void {
  const entry = activeVocabulary().find((candidate) => candidate.id === spec.vocabId);
  if (!entry) {
    throw new Error(`Unbekannte Vokabel "${spec.vocabId}" — kein Bild ohne geprüften Eintrag.`);
  }
  if (!canHaveImage(entry)) {
    throw new Error(
      `"${entry.id}" (${entry.german}) ist nicht konkret — für diesen Eintrag wird ` +
        'kein Bild erzeugt.'
    );
  }
}

export type ImagePlanOptions = {
  /**
   * Welche Sprache bebildert wird (Phase 16, Pflicht 4). Ohne diese Angabe
   * liefe ein Lauf ueber alle drei Grundstoecke.
   */
  language?: LanguageCode;
  /** Standardmäßig der Grundstock der gewaehlten Sprache. */
  entries?: VocabEntry[];
  /** Höchstzahl für einen Probelauf; ohne Angabe alle konkreten Einträge. */
  limit?: number;
};

export function planImages(options: ImagePlanOptions = {}): ImageSpec[] {
  const entries = options.entries ?? vocabularyFor(options.language ?? 'th');
  const specs = entries.filter(canHaveImage).map(imageSpecFor);
  return limitPlan(assertUniqueIds(specs), options.limit);
}

/** Wie viele Vokabeln überhaupt bildfähig sind. */
export function countImageCandidates(
  entries: VocabEntry[] = vocabularyFor('th')
): number {
  return entries.filter(canHaveImage).length;
}
