import { dictationConfigFor } from '@/data/dictation-config';

import { grundsaetzeFuer, satzaufgabenFuer, sentenceFootnote, type SatzSprache } from '@/data/sentence-tasks';

import { seededRandom, shuffled } from '@/lib/drills/random';

import { anchorOf, type PairDirection } from '@/lib/languages/types';
import type { LearningStage } from '@/lib/learning-stages';
import { selectPracticeWords } from '@/lib/practice-selection';
import type { PracticeContext } from '@/lib/word-practice';

/**
 * Diktat-Aufgaben aus den Satz-Daten der Zielsprache — NICHT aus einem
 * zweiten Satzbestand. `SENTENCE_TASKS_BY_LANGUAGE` enthält die Satzlesarten
 * der Registry (seit 18.09.2026: die generierten Beispielsätze je Sprache,
 * auch Deutsch); das Diktat erbt sie und damit deren Ehrlichkeit: Eine
 * Sprache ohne Satzstoff bleibt leer — und die Übung sagt das, statt Stoff
 * zu erfinden (dieselbe Regel wie AE-66).
 *
 * DIE RICHTUNG WIRD DURCHGEREICHT (18.09.2026): Für `de_to_<Sprache>` war
 * sie früher hier abgeleitet — dem Deutsch-Ziel (th_to_de) würde damit
 * entweder ein ungültiges `de_to_de` untergeschoben oder die falsche Karte
 * fortgeschrieben. Der Aufrufer kennt die Lernrichtung; die FSRS-Karte
 * (AE-16: eine Erinnerungsspur je Item, kein zweiter Schlüssel) muss dieselbe
 * sein wie bei Karteikarte und freiem Schreiben dieser Richtung.
 */

export type DictationTask = {
  /** `dictation-<vocabId>` — eindeutig je Vokabel. */
  id: string;
  /** Die Vokabel, aus deren Satzlesart das Diktat entstand — Schlüssel der FSRS-Karte. */
  vocabId: string;
  /** Zielsprache, die getippt wird (seit 18.09. auch `de`). */
  language: SatzSprache;
  /** Die Lernrichtung des Aufrufers — derselbe Kartenschlüssel wie Karteikarte/Schreiben. */
  direction: PairDirection;
  /** Der Satz, den es zu hören und zu tippen gilt — die Lösung. */
  text: string;
  /** Bedeutung auf Deutsch — erst NACH der Auswertung gezeigt, sonst liest man die Lösung vor dem Hören. */
  german: string;
  /** Umschrift — ebenfalls erst nach der Auswertung (sie wäre die halbe Lösung). */
  roman: string;
  /** Der Hinweis zur Aufgabe, nach der Auswertung gezeigt. */
  focus: string;
};

/** Sprachen ohne Satzstoff liefern ehrlich nichts — der Runner zeigt einen Hinweis. */
export function dictationTasksFor(
  language: SatzSprache,
  direction: PairDirection,
  /**
   * Nur Sätze des Grundwortschatzes — für die eigenständige Übung (16.10.2026).
   * Die Heutige Runde filtert selbst auf ihre Karten und braucht alle Sätze.
   */
  options: { grundwortschatz?: boolean; stage?: LearningStage } = {}
): DictationTask[] {
  // Der Konfigurationseintrag ist die Fachlichkeit-Prüfung: Eine Sprache
  // ohne Diktat-Regeln kann keine Diktate urteilen.
  dictationConfigFor(language);
  // Der Anker steuert dieRegistry (21.09.2026): Das Diktat tippt immer die
  // ZIELsprache — der Anker ändert hier nur, welche Aufgabenbasis der
  // Registry-Cache liefert (de-Brücke: Bedeutungsstoff, sonst derselbe).
  const anchor = anchorOf(direction);
  return (options.grundwortschatz ? grundsaetzeFuer(language, anchor, options.stage) : satzaufgabenFuer(language, anchor))
    .filter((task) => task.text.trim().length > 0)
    .map((task) => ({
      id: `dictation-${task.vocabId}`,
      vocabId: task.vocabId,
      language,
      direction,
      text: task.text,
      german: task.german,
      roman: task.roman,
      focus: task.focus,
    }));
}

/** Wie eine Runde freies Schreiben — kurz genug, dass sie zu Ende geübt wird. */
export const DICTATION_SESSION_SIZE = 10;

/**
 * Eine Diktat-Runde: gemischt, mit Aussaat reproduzierbar (dieselbe Bauart
 * wie die Sitzungen der Übungen — Tests stellen sie exakt nach).
 *
 * Mit Kartenstand und Übungsgedächtnis (22.10.2026) wählt das Diktat wie die
 * anderen freien Übungen: Sätze zu gelernten, wackligen Wörtern zuerst, nur
 * wenige zu neuen (`practice-selection.ts`). Ohne sie bleibt es beim Mischen.
 */
export function buildDictationSession(
  language: SatzSprache,
  direction: PairDirection,
  seed: number = Date.now(),
  size: number = DICTATION_SESSION_SIZE,
  /** Nur Sätze aus dem Grundwortschatz dieser Stufe (18.10.2026). */
  stage?: LearningStage,
  context?: PracticeContext
): DictationTask[] {
  const tasks = dictationTasksFor(language, direction, { grundwortschatz: true, stage });
  const random = seededRandom(seed);
  if (!context) return shuffled(tasks, random).slice(0, size);
  return selectPracticeWords(tasks, { ...context, idOf: (task) => task.vocabId, size, random });
}

/** Der ehrliche Fußtext je Sprache — geerbt von den Satzübungen. */
export function dictationFootnote(language: SatzSprache, uiLanguage: import('../i18n/types').UiLanguage = 'de'): string {
  return sentenceFootnote(language, uiLanguage);
}
