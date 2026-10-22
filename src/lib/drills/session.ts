import { VocabEntry } from '@/data/vocab-types';

import { anchorOf, LanguageCode, PairDirection } from '../languages/types';
import type { UiLanguage } from '../i18n/types';
import { stageOfEntry, type LearningStage } from '../learning-stages';
import { selectPracticeWords } from '../practice-selection';
import { ensureCardStates } from '../review-session';
import { DataStore, getStore } from './../storage';
import { loadWordPractice } from '../word-practice';

import {
  buildArticleQuestion,
  buildDeutschLesenQuestion,
  buildIrregularPastQuestion,
  buildPartizipQuestion,
  buildPraesensEndungQuestion,
  buildSoundSpellingQuestion,
  buildSpellingQuestion,
  buildStressHearQuestion,
  buildStressQuestion,
  buildToneQuestion,
  buildToneRuleQuestion,
  buildVerbFormQuestion,
  canBuildArticleQuestion,
  canBuildDeutschLesenQuestion,
  canBuildIrregularPastQuestion,
  canBuildPartizipQuestion,
  canBuildPraesensEndungQuestion,
  canBuildSoundSpellingQuestion,
  canBuildSpellingQuestion,
  canBuildStressHearQuestion,
  canBuildStressQuestion,
  canBuildToneQuestion,
  canBuildToneRuleQuestion,
  canBuildVerbFormQuestion,
} from './questions';
import { Random, seededRandom } from './random';
import { directionForDrill, DrillAnswer, DrillId, DrillQuestion, isGrammarSetDrill } from './types';
import { buildGrammarSession } from './grammar';

/**
 * Eine Übungssitzung zusammenstellen.
 *
 * DIE ÜBUNGEN PLANEN NICHTS, SIE LESEN NUR (AE-16). Sie legen keine eigenen
 * FSRS-Karten an und schreiben keine zurück. Aber sie sind auch nicht blind:
 * **welche** Wörter drankommen, entscheidet der vorhandene FSRS-Zustand
 * derselben Richtung — am schwächsten Sitzendes zuerst, genau die Sortierung,
 * die auch `buildReviewQueue` benutzt.
 *
 * Anders als beim Karteikasten wird aber nicht stur der schwächste Kopf
 * genommen: Aus einem **Fenster** der dringendsten Kandidaten wird zufällig
 * gezogen — der Schwerpunkt bleibt auf dem Wackligen, die Sitzung wiederholt
 * sich aber nicht wörtlich.
 *
 * SEIT 22.10.2026 über `selectPracticeWords`: gelernte, wacklige Wörter
 * zuerst, nur wenige neue, und die Übungsantworten je Wort
 * (`word-practice.ts`) verschieben die Auswahl — Karten bleiben unberührt.
 */

/** Aufgaben je Sitzung. */
export const DRILL_SESSION_SIZE = 10;

export type DrillSessionOptions = {
  drill: DrillId;
  /**
   * Welche Sprache geuebt wird.
   *
   * SEIT PHASE 16 NOETIG UND BEWUSST OHNE VORGABEWERT: Die Artikel-Uebung
   * gilt fuer jedes "X -> Deutsch" (Pflicht 6 aus Phase 15), und welches X
   * gemeint ist, kann diese Datei nicht wissen. Ein stiller Vorgabewert
   * 'th' wuerde spanische Sitzungen klammheimlich mit Thai-Karten fuellen.
   *
   * SEIT DEM PAARMATRIX-START VOM TYP `LanguageCode`: Jede Zielsprache
   * ohne eigenen Bestand liefert schlicht `available: 0` — ehrlich leer
   * statt falsch gefuellt.
   */
  language: LanguageCode;
  direction?: PairDirection;
  /**
   * ANKER- UND UI-SPRACHE (21.09.2026): Der Anker entscheidet, in welcher
   * Sprache Bedeutungen/Hints stehen (`translations[anchor]`), die UI-Sprache
   * welche Chrome-Sätze (Erklärungen, Ordnungszahlen) — beides Default 'de'
   * für Bestandsaufrufer. Der Runner reicht beides aus der aktuellen
   * Oberfläche durch.
   */
  anchor?: UiLanguage;
  uiLanguage?: UiLanguage;
  store?: DataStore;
  now?: number;
  size?: number;
  /** Für Tests und reproduzierbare Sitzungen. */
  seed?: number;
  /** Runtime media eligibility, applied before ranking/windowing the candidates. */
  isEligible?: (entry: VocabEntry) => boolean | Promise<boolean>;
  /** Optionally restrict a mixed round to the words it just reviewed. */
  onlyVocabIds?: ReadonlySet<string>;
  /** Nur Wörter dieser Stufe (Stufenschalter im Lern-Reiter, 18.10.2026). */
  stage?: LearningStage;
};

export type DrillSession = {
  drill: DrillId;
  questions: DrillQuestion[];
  /** Wie viele Vokabeln für diese Übung überhaupt taugen. */
  available: number;
};

function canBuild(drill: DrillId, entry: VocabEntry): boolean {
  switch (drill) {
    case 'tone':
      return canBuildToneQuestion(entry);
    case 'toneRule':
      return canBuildToneRuleQuestion(entry);
    case 'article':
      return canBuildArticleQuestion(entry);
    case 'verbForms':
      return canBuildVerbFormQuestion(entry);
    case 'deutschLesen':
      return canBuildDeutschLesenQuestion(entry);
    case 'irregularPast':
      return canBuildIrregularPastQuestion(entry);
    case 'stressRule':
      return canBuildStressQuestion(entry);
    case 'spelling':
      return canBuildSpellingQuestion(entry);
    case 'stressHear':
      return canBuildStressHearQuestion(entry);
    case 'soundSpelling':
      return canBuildSoundSpellingQuestion(entry);
    case 'praesensEndung':
      return canBuildPraesensEndungQuestion(entry);
    case 'partizip':
      return canBuildPartizipQuestion(entry);
    case 'polite':
    case 'serEstar':
    case 'zaehlerwort':
    case 'konsonantenklasse':
      // Datensatz-Übungen ohne Vokabelstoff — ihre Sitzung entsteht im
      // Zweig darüber aus `data/grammar-*` und erreicht diese Stelle nie.
      return false;
  }
}

function buildQuestion(
  drill: DrillId,
  entry: VocabEntry,
  pool: VocabEntry[],
  random: Random,
  direction: PairDirection,
  anchor: UiLanguage,
  ui: UiLanguage
): DrillQuestion {
  switch (drill) {
    case 'tone':
      return buildToneQuestion(entry, anchor, ui);
    case 'toneRule':
      return buildToneRuleQuestion(entry, anchor, ui);
    case 'article':
      return buildArticleQuestion(entry, anchor, ui);
    case 'verbForms':
      return buildVerbFormQuestion(entry, pool, random, anchor, ui);
    case 'deutschLesen':
      return buildDeutschLesenQuestion(entry, pool, random, direction);
    case 'irregularPast':
      return buildIrregularPastQuestion(entry, pool, random, anchor, ui);
    case 'stressRule':
      return buildStressQuestion(entry, anchor, ui);
    case 'spelling':
      return buildSpellingQuestion(entry, undefined, anchor, ui);
    case 'stressHear':
      return buildStressHearQuestion(entry, anchor, ui);
    case 'soundSpelling':
      return buildSoundSpellingQuestion(entry, undefined, random, anchor, ui);
    case 'praesensEndung':
      return buildPraesensEndungQuestion(entry, pool, random, anchor, ui);
    case 'partizip':
      return buildPartizipQuestion(entry, pool, random, anchor, ui);
    case 'polite':
    case 'serEstar':
    case 'zaehlerwort':
    case 'konsonantenklasse':
      // Siehe canBuild — hier nie erreicht.
      throw new Error(`"${drill}" wird aus dem Grammatik-Datensatz zusammengestellt.`);
  }
}

export async function buildDrillSession(options: DrillSessionOptions): Promise<DrillSession> {
  const drill = options.drill;
  const direction = options.direction ?? directionForDrill(drill, options.language);
  // Ohne ausdrücklichen Anker gilt die Ankerseite der Richtung.
  const anchor = options.anchor ?? anchorOf(direction);
  const ui = options.uiLanguage ?? 'de';
  const now = options.now ?? Date.now();
  const size = options.size ?? DRILL_SESSION_SIZE;
  const random = seededRandom(options.seed ?? now);

  // GRAMMATIK-KLEINSTÜBUNGEN (Höflichkeitspartikel, ser/estar, Zählwörter,
  // Konsonantenklassen) haben keine FSRS-Karten — ihre Sitzung wird rein
  // aus dem Datensatz gemischt. Vor allem: KEIN `ensureCardStates`, denn
  // das legt als Seiteneffekt Karten an, und eine Partikel-Übung darf
  // keinen Kartenschlüssel erzeugen, den kein Kartenstoff je bewertet.
  if (isGrammarSetDrill(drill)) {
    const { questions, available } = buildGrammarSession(drill, random, size, anchor, ui);
    return { drill, questions, available };
  }

  const db = options.store ?? (await getStore());
  const { entries, cards } = await ensureCardStates(direction, db, now);
  const practice = await loadWordPractice(db);

  const cardByVocabId = new Map(cards.map((card) => [card.vocabId, card]));
  const potential = entries.filter((entry) =>
    (!options.onlyVocabIds || options.onlyVocabIds.has(entry.id)) &&
    (!options.stage || stageOfEntry(entry) === options.stage) &&
    canBuild(drill, entry) &&
    (drill !== 'deutschLesen' || String(entry.language) !== 'de' || Boolean(entry.translations?.[direction.split('_to_')[0] as UiLanguage]))
  );
  const eligibility = options.isEligible ? await Promise.all(potential.map(options.isEligible)) : potential.map(() => true);
  const candidates = potential.filter((_, i) => eligibility[i]);

  const chosen = selectPracticeWords(candidates, {
    idOf: (entry) => entry.id,
    cards: cardByVocabId,
    practice,
    now,
    size,
    random,
    // Mit fester Wortliste (Heutige Runde, Kapitel) ist Neues der Stoff.
    limitNew: !options.onlyVocabIds,
  });

  return {
    drill,
    questions: chosen.map((entry) => buildQuestion(drill, entry, candidates, random, direction, anchor, ui)),
    available: candidates.length,
  };
}

export function scoreAnswers(answers: DrillAnswer[]): { correct: number; total: number } {
  return {
    correct: answers.filter((answer) => answer.correct).length,
    total: answers.length,
  };
}
