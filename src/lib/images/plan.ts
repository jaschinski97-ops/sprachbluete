import { VocabEntry } from '@/data/vocab-types';
import { activeVocabulary, activeVocabularyFor as vocabularyFor } from '@/data/active-vocabulary';

import { CONCEPT_PREFIX, imageKeyOf, isSharedConcept, normalizeConcept } from '../concepts';
import { LEARNING_LANGUAGES } from '../languages/definitions';
import { LanguageCode } from '../languages/types';

import { assertUniqueIds, limitPlan } from '../generation/plan';

import { imageIdFor } from './concept-images';
import { hasMotif, motifFor, motifKey } from './motifs';
import { ImageSpec } from './types';

/**
 * Der Bauplan eines Bilderlaufs — und zugleich das Tor, das abstrakte
 * Einträge draußen hält (AE-15).
 *
 * Anders als bei den Sprachsituationen entsteht der Plan nicht aus einem
 * Kreuzprodukt, sondern aus dem vorhandenen Vokabel-Grundstock: **je Begriff
 * höchstens ein Bild** (seit 24.10.2026, vorher je Vokabel), und nur, wenn
 * `isConcrete` gesetzt ist. Wörter mit gemeinsamem Begriff (`c:…`) teilen
 * die Bild-ID über alle Sprachen; ein Bild aus dem Englisch-Lauf gilt im
 * Thai-Lauf deshalb als vorhanden und wird nicht noch einmal bezahlt. Die
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
  // Seit 24.10.2026: ein gemeinsamer Begriff reicht, das Motiv entsteht aus ihm.
  return entry.isConcrete === true &&
    (isSharedConcept(entry.concept) || hasMotif(motifKey(entry)) || entry.id.startsWith('ki-'));
}

/** Wie ein Auftrag zu bauen ist: Sprach-Ausnahme und Wörter für das Motiv. */
export type ImageSpecOptions = {
  /** Eigenes Bild nur für diese Lernsprache (kulturabhängiger Begriff). */
  language?: string;
  /**
   * Wörter aller Sprachen, aus denen das englische Motiv kommt (das
   * englische Wort des Begriffs). Standard: der ganze Grundstock.
   */
  motifWords?: readonly VocabEntry[];
};

/**
 * Baut den Auftrag für eine Vokabel — und wirft, wenn sie nicht konkret ist.
 *
 * Erste von drei Sperren: hier, in `imageTask.produce` vor dem Netzaufruf und
 * im API-Client selbst. Dreifach, weil eine einzelne Sperre irgendwann durch
 * einen neuen Aufrufer umgangen wird; das Tor soll aber an keiner Stelle
 * passierbar sein.
 */
export function imageSpecFor(entry: VocabEntry, options: ImageSpecOptions = {}): ImageSpec {
  if (!canHaveImage(entry)) {
    throw new Error(
      `"${entry.id}" (${entry.german}) ist nicht konkret — für diesen Eintrag wird ` +
        'kein Bild erzeugt.'
    );
  }
  const key = imageKeyOf(entry);
  if (isSharedConcept(key)) {
    // Ein Bild je Begriff: das Motiv einmal, englisch, aus dem Begriff.
    const language = options.language;
    return {
      id: imageIdFor(key, language),
      vocabId: entry.id,
      concept: key,
      ...(language ? { language } : {}),
      thai: entry.term,
      romanization: entry.romanization,
      german: entry.german,
      partOfSpeech: entry.partOfSpeech,
      motif: conceptMotif(entry, key, options.motifWords ?? activeVocabulary(), language),
      isConcrete: true,
    };
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
export function generatedMotif(entry: VocabEntry, englishOverride?: string): string {
  // Ohne Anführungszeichen: Ein zitiertes Wort malt FLUX als Schriftzug ins
  // Bild ("Bill", "Exit"). Die Übersetzung steht deshalb nur im Satz.
  const english = (englishOverride ?? entry.translations?.en ?? (entry.language === 'en' ? entry.term : entry.german)).trim();
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

/** Wo eine Sprach-Ausnahme spielt — fehlt eine Sprache, gilt ihr Name. */
const CULTURE_OF: Partial<Record<string, string>> = {
  th: 'Thailand',
  en: 'England',
  es: 'Spain',
  de: 'Germany',
};

function cultureOf(language: string): string {
  const label = (LEARNING_LANGUAGES as Partial<Record<string, { label: string }>>)[language]?.label;
  return CULTURE_OF[language] ?? `a country where ${label ?? language} is spoken`;
}

/** Begriff → Wort der englischen Lernsprache, einmal je Wortliste gebaut. */
const englishIndexCache = new WeakMap<readonly VocabEntry[], Map<string, string>>();
function englishIndex(words: readonly VocabEntry[]): Map<string, string> {
  let index = englishIndexCache.get(words);
  if (!index) {
    index = new Map();
    for (const word of words) {
      if (word.language === 'en' && isSharedConcept(word.concept) && !index.has(word.concept)) index.set(word.concept, word.term);
    }
    englishIndexCache.set(words, index);
  }
  return index;
}

/**
 * Das englische Wort zu einem Begriff: das Wort der englischen Lernsprache,
 * sonst die englische Übersetzung, sonst der Begriff selbst. Steckt im
 * Begriff eine Bedeutungsangabe (`c:bank_money` zu „bank“), kommt sie in
 * Klammern dazu — sonst malt das Modell die falsche Bank.
 */
export function conceptEnglish(entry: VocabEntry, concept: string, motifWords: readonly VocabEntry[]): string {
  const base = concept.slice(CONCEPT_PREFIX.length);
  const english = (
    englishIndex(motifWords).get(concept) ??
    (entry.language === 'en' ? entry.term : entry.translations?.en) ??
    base.replace(/_/g, ' ')
  ).trim();
  const own = normalizeConcept(english)?.slice(CONCEPT_PREFIX.length);
  if (own && base !== own && base.startsWith(`${own}_`)) {
    return `${english} (${base.slice(own.length + 1).replace(/_/g, ' ')})`;
  }
  return english;
}

/** Motiv eines Begriffsbilds; die Sprach-Ausnahme zeigt den Begriff landestypisch. */
export function conceptMotif(
  entry: VocabEntry,
  concept: string,
  motifWords: readonly VocabEntry[],
  language?: string
): string {
  const motif = generatedMotif(entry, conceptEnglish(entry, concept, motifWords));
  return language ? `${motif} Show it as it typically looks in ${cultureOf(language)}.` : motif;
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
  if (spec.concept !== undefined && entry.concept !== spec.concept) {
    throw new Error(`"${entry.id}" trägt nicht den Begriff ${spec.concept} — kein Bild.`);
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
  /**
   * Begriffe, die in dieser Lernsprache ein eigenes Bild bekommen (Geld,
   * typisches Essen). Freiwillig; ohne Angabe teilen alle Sprachen ein Bild.
   */
  ownImageConcepts?: readonly string[];
  /** Wörter aller Sprachen für das englische Motiv (Standard: Grundstock). */
  motifWords?: readonly VocabEntry[];
};

/**
 * Je Bild-ID ein Auftrag. Mehrere Wörter eines Begriffs (Synonyme) teilen
 * ihn; das erste Wort in Katalogreihenfolge ist der Anker.
 */
export function planImages(options: ImagePlanOptions = {}): ImageSpec[] {
  const entries = options.entries ?? vocabularyFor(options.language ?? 'th');
  const own = new Set((options.ownImageConcepts ?? []).map((raw) => normalizeConcept(raw)).filter(Boolean));
  const motifWords = options.motifWords ?? activeVocabulary();
  const specs = new Map<string, ImageSpec>();
  for (const entry of entries) {
    if (!canHaveImage(entry)) continue;
    const key = imageKeyOf(entry);
    const language = isSharedConcept(key) && own.has(key) ? String(entry.language) : undefined;
    const id = imageIdFor(key, language);
    if (!specs.has(id)) specs.set(id, imageSpecFor(entry, { language, motifWords }));
  }
  return limitPlan(assertUniqueIds([...specs.values()]), options.limit);
}

/** Wie viele Vokabeln überhaupt bildfähig sind. */
export function countImageCandidates(
  entries: VocabEntry[] = vocabularyFor('th')
): number {
  return entries.filter(canHaveImage).length;
}

/** Was ein Lauf kostet und spart — die Zahlen für die Studio-Planung. */
export type ImagePlanSummary = {
  /** Bildfähige Wörter der Sprache. */
  words: number;
  /** Davon verschiedene Bilder (je Begriff eines, Ausnahmen eigens). */
  images: number;
  /** Bilder, die es schon gibt — auch aus dem Lauf einer anderen Sprache. */
  existing: number;
  /** Was der Lauf noch erzeugen müsste. */
  toGenerate: number;
  /** Gegenüber „ein Bild je Wort“ gesparte Bilder. */
  saved: number;
};

export function summarizeImagePlan(
  options: ImagePlanOptions & { existingIds: ReadonlySet<string> }
): ImagePlanSummary {
  const entries = options.entries ?? vocabularyFor(options.language ?? 'th');
  const specs = planImages({ ...options, entries, limit: undefined });
  const words = entries.filter(canHaveImage).length;
  const existing = specs.filter((spec) => options.existingIds.has(spec.id)).length;
  const toGenerate = specs.length - existing;
  return { words, images: specs.length, existing, toGenerate, saved: words - toGenerate };
}
