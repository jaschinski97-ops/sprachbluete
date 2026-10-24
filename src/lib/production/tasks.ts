import type { VocabEntry } from '@/data/vocab-types';
import type { UiLanguage } from '../i18n/types';
import { satzaufgabenFuer } from '@/data/sentence-tasks';

import { type FSRSCardState } from '../fsrs/types';
import { type PairDirection, targetLanguageOf, anchorOf } from '../languages/types';
import { bridgeText } from '../languages/bridge';
import { inStage, type LearningStage } from '../learning-stages';
import { selectPracticeWords } from '../practice-selection';
import { ensureCardStates } from '../review-session';
import { seededRandom } from '../drills/random';
import { type DataStore } from '../storage';
import { loadWordPractice, type WordPractice } from '../word-practice';

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

type Auswahl = {
  cards: ReadonlyMap<string, FSRSCardState>;
  practice: ReadonlyMap<string, WordPractice>;
  now: number;
  random: ReturnType<typeof seededRandom>;
};

function wortAufgaben(
  entries: VocabEntry[],
  anzahl: number,
  auswahl: Auswahl,
  source: UiLanguage
): ProduktionsAufgabe[] {
  // Die Bedeutung in der ANKERSPRACHE — seit dem Sprach-Umbau für jede
  // Zielsprache derselbe Weg (vorher ein eigener Deutsch-Zweig). Ohne echte
  // Übersetzung (Rückfall auf dieselbe Form) gäbe es keinen ehrlichen Auftrag.
  const mitAuftrag = entries.filter((entry) => {
    const bedeutung = bridgeText(entry, source).text.trim();
    return bedeutung.length > 0 && bedeutung !== entry.term;
  });
  // Gelernte, wacklige Wörter zuerst, nur wenige neue (`practice-selection.ts`).
  return selectPracticeWords(mitAuftrag, { ...auswahl, idOf: (entry) => entry.id, size: anzahl }).map((entry) => ({
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
  const now = Date.now();
  const random = seededRandom(options.seed ?? now);
  const sprache = targetLanguageOf(options.direction);
  const { entries: alle, cards } = await ensureCardStates(options.direction, options.store, now);
  const entries = inStage(alle, options.stage);
  const auswahl: Auswahl = {
    cards: new Map(cards.map((card) => [card.vocabId, card])),
    practice: await loadWordPractice(options.store),
    now,
    random,
  };

  // Sätze zuerst — wo geprüfte Sätze liegen, werden sie gebildet. Nur Sätze
  // mit gelieferter Bedeutung in der App-Sprache (seit 24.10.2026
  // `exampleTranslations`, auf Deutsch auch `exampleGerman`); ohne sie
  // springt die Wort-Ebene ein (21.09.2026, Nutzerbefund en-UI).
  {
    const saetze = satzaufgabenFuer(sprache, anchorOf(options.direction)).filter((task) => task.meaning);
    if (saetze.length >= Math.min(anzahl, 4)) {
      const byVocabId = new Map(saetze.map((task) => [task.vocabId, task]));
      const mitSatz = entries.flatMap((entry) => byVocabId.has(entry.id) ? [byVocabId.get(entry.id)!] : []);
      // Dieselbe Auswahl wie bei den Wörtern: gelernte, wacklige zuerst.
      if (mitSatz.length >= Math.min(anzahl, 4)) return selectPracticeWords(mitSatz, { ...auswahl, idOf: (task) => task.vocabId, size: anzahl })
        .map((task) => ({
          id: `produktion-satz-${task.vocabId}`,
          vocabId: task.vocabId,
          art: 'satz' as const,
          bedeutung: task.meaning ?? task.german,
          ziel: task.text,
          roman: task.roman,
        }));
    }
  }

  // Wörter: gelernte, wacklige zuerst, aus einem Fenster gezogen.
  return wortAufgaben(entries, anzahl, auswahl, anchorOf(options.direction));
}
