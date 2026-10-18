import type { VocabEntry } from '@/data/vocab-types';
import type { UiLanguage } from '../i18n/types';
import { SENTENCE_TASKS_BY_LANGUAGE } from '@/data/sentence-tasks';

import { retrievability } from '../fsrs/fsrs';
import { type FSRSCardState } from '../fsrs/types';
import { type PairDirection, targetLanguageOf, anchorOf } from '../languages/types';
import { bridgeText } from '../languages/bridge';
import { inStage, type LearningStage } from '../learning-stages';
import { ensureCardStates } from '../review-session';
import { seededRandom, shuffled } from '../drills/random';
import { type DataStore } from '../storage';

/**
 * Aufgaben für „Sag es auf …“ (Schritt 3, Lern-Reiter-Ausbau).
 *
 * Der Stoff folgt der vorhandenen Wahrheit je Sprache: Wo geprüfte Sätze
 * liegen (Thai), bildet die lernende Person SÄTZE; wo es nur geprüfte
 * Wörter gibt (Englisch, Spanisch, und Deutsch als Ziel ohne eigenen
 * Satzbestand), eben WÖRTER. Nichts wird erfunden — derselbe Grundsatz wie
 * bei den Satzübungen (AE-66).
 *
 * DIE RICHTUNG ENTSCHEIDET DIE SEITEN: In `de_to_th` heißt es „Sag es auf
 * Thai“ — Bedeutung deutsch, Ziel thai. Im Deutsch-Ziel (`th_to_de`) ist es
 * umgekehrt: Bedeutung thai, Ziel deutsch. Die FSRS-Karte ist dieselbe wie
 * bei Karteikarte, Diktat und freiem Schreiben (AE-16).
 */

/** Aufgaben je Runde. */
export const PRODUKTION_ANZAHL = 8;

/** Aus wie vielen der schwächsten Kandidaten gezogen wird. */
const FENSTER = 3;

export type ProduktionsAufgabe = {
  /** Eindeutig innerhalb der Runde. */
  id: string;
  /** FSRS-Karte, die die Antwort fortschreibt. */
  vocabId: string;
  /** `satz` nur, wo geprüfte Sätze liegen. */
  art: 'wort' | 'satz';
  /** Die Bedeutung, die gezeigt wird (Vorderseite). */
  bedeutung: string;
  /** Die zu produzierende Zielform (Lösung). */
  ziel: string;
  /** Lesehilfe der ZIELsprache — erst nach der Antwort gezeigt. */
  roman?: string;
};

function wortAufgaben(
  entries: VocabEntry[],
  cards: FSRSCardState[],
  anzahl: number,
  random: ReturnType<typeof seededRandom>,
  source: UiLanguage
): ProduktionsAufgabe[] {
  const byVocabId = new Map(cards.map((card) => [card.vocabId, card]));
  const schwaeche = (card: FSRSCardState | undefined): number =>
    card ? retrievability(card, Date.now()) : 0;
  // Die Bedeutung in der ANKERSPRACHE — seit dem Sprach-Umbau für jede
  // Zielsprache derselbe Weg (vorher ein eigener Deutsch-Zweig). Ohne echte
  // Übersetzung (Rückfall auf dieselbe Form) gäbe es keinen ehrlichen Auftrag.
  const mitAuftrag = entries.filter((entry) => {
    const bedeutung = bridgeText(entry, source).text.trim();
    return bedeutung.length > 0 && bedeutung !== entry.term;
  });
  const ranked = mitAuftrag.sort(
    (a, b) => schwaeche(byVocabId.get(a.id)) - schwaeche(byVocabId.get(b.id))
  );
  const fenster = ranked.slice(0, Math.max(anzahl, anzahl * FENSTER));
  return shuffled(fenster, random).slice(0, anzahl).map((entry) => ({
    id: `produktion-wort-${entry.id}`,
    vocabId: entry.id,
    art: 'wort' as const,
    bedeutung: bridgeText(entry, source).text,
    ziel: entry.term,
    roman: entry.romanization && entry.romanization !== entry.term ? entry.romanization : undefined,
  }));
}

export async function produktionsAufgaben(options: {
  direction: PairDirection;
  anzahl?: number;
  store?: DataStore;
  seed?: number;
  /** Nur Wörter dieser Stufe (Stufenschalter im Lern-Reiter, 18.10.2026). */
  stage?: LearningStage;
}): Promise<ProduktionsAufgabe[]> {
  const anzahl = options.anzahl ?? PRODUKTION_ANZAHL;
  const random = seededRandom(options.seed ?? Date.now());
  const sprache = targetLanguageOf(options.direction);
  const { entries: alle, cards } = await ensureCardStates(options.direction, options.store, Date.now());
  const entries = inStage(alle, options.stage);

  // Sätze zuerst — wo geprüfte Sätze liegen, werden sie gebildet. Der
  // Satzbestand trägt seine Bedeutungen NUR auf Deutsch (`exampleGerman`) —
  // auf anderen Brücken gäbe es keinen ehrlichen Auftragsatz, dort springt
  // die Wort-Ebene ein (21.09.2026, Nutzerbefund en-UI: deutsche Aufträge).
  if (anchorOf(options.direction) === 'de') {
    const saetze = SENTENCE_TASKS_BY_LANGUAGE[sprache] ?? [];
    if (saetze.length >= Math.min(anzahl, 4)) {
      const byVocabId = new Map(saetze.map((task) => [task.vocabId, task]));
      const started = new Set(cards.filter((card) => card.state !== 'new').map((card) => card.vocabId));
      const ordered = [...entries.filter((entry) => started.has(entry.id)),
        ...entries.filter((entry) => !started.has(entry.id))]
        .flatMap((entry) => byVocabId.has(entry.id) ? [byVocabId.get(entry.id)!] : []);
      if (ordered.length >= Math.min(anzahl, 4)) return shuffled(ordered.slice(0, Math.max(anzahl, anzahl * FENSTER)), random)
        .slice(0, anzahl)
        .map((task) => ({
          id: `produktion-satz-${task.vocabId}`,
          vocabId: task.vocabId,
          art: 'satz' as const,
          bedeutung: task.german,
          ziel: task.text,
          roman: task.roman,
        }));
    }
  }

  // Wörter: schwächste zuerst, aus einem Fenster gezogen.
  return wortAufgaben(entries, cards, anzahl, random, anchorOf(options.direction));
}
