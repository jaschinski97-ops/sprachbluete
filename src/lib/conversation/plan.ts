import { Direction } from '../fsrs/types';
import { directionsFor, LANGUAGE_CODES, LanguageCode } from '../languages/types';

import {
  ALL_LEVELS, Level, LEVELS, situationId, SituationSpec, TopicId, topicFitsLevel, TOPICS, Situationssprache, SITUATION_SPRACHEN,
} from './types';

/**
 * Der Bauplan eines Laufs.
 *
 * Die Liste steht **vor** dem ersten Netzwerkaufruf fest und ist
 * deterministisch: dieselben Eingaben ergeben dieselben IDs. Genau das macht
 * einen abgebrochenen Lauf fortsetzbar — beim Neustart wird geprüft, welche
 * IDs schon im Speicher liegen, und nur der Rest angefragt.
 */

/** Sprachmodule mit einem eigenen sprachspezifischen Erzeugungs-Prompt. */
export const SITUATION_LANGUAGES: readonly LanguageCode[] = LANGUAGE_CODES;

export type PlanOptions = {
  /** Fuer welche Sprache geplant wird. Ohne Angabe Thai. */
  language?: LanguageCode;
  targetLanguage?: Situationssprache;
  topics?: readonly TopicId[];
  levels?: readonly Level[];
  directions?: readonly Direction[];
  /** Wie viele Varianten je Kombination aus Thema, Niveau und Richtung. */
  variantsPerCombo?: number;
};

/**
 * Probelauf des Studios: jedes Thema einmal auf jeder passenden Stufe A1–C2,
 * 59 Situationen je Sprache (Anfänger 16, Fortgeschritten 23, Profi 20).
 */
export const TEST_RUN: PlanOptions = { variantsPerCombo: 1, levels: ALL_LEVELS };

/**
 * Der große Lauf, den der Nutzer im Studio selbst startet: 4 Varianten je
 * Thema und passender Stufe = 236 Situationen je Sprache (Nutzerentscheidung
 * 18.10.2026: mehr Themen statt mehr Varianten). `content:integrity` zählt
 * die fehlenden Situationen gegen genau diesen Plan.
 */
export const FULL_RUN: PlanOptions = { variantsPerCombo: 4, levels: ALL_LEVELS };

export function planSituations(options: PlanOptions = {}): SituationSpec[] {
  const language = options.language ?? 'th';
  if (!SITUATION_LANGUAGES.includes(language)) {
    throw new Error(
      `Fuer "${language}" gibt es noch keinen geprueften Aufgabentext fuer ` +
        'Sprachsituationen (siehe SITUATION_LANGUAGES).'
    );
  }
  const topics = options.topics ?? TOPICS.map((t) => t.id);
  const levels = options.levels ?? LEVELS;
  const directions = options.targetLanguage
    ? [SITUATION_SPRACHEN.find(item => item.sprache === options.targetLanguage)!.direction]
    : options.directions ?? directionsFor(language);
  const variants = Math.max(1, options.variantsPerCombo ?? 1);

  const specs: SituationSpec[] = [];
  // Reihenfolge: erst die Varianten der äußeren Schleifen durchmischen, damit
  // ein abgebrochener Lauf trotzdem schon alle Themen abgedeckt hat statt nur
  // 200 Varianten des ersten.
  for (let variant = 1; variant <= variants; variant++) {
    for (const topic of topics) {
      for (const level of levels) {
        // Themen gelten nur auf ihren Stufen („Behörden & Bank“ erst ab B1).
        if (!topicFitsLevel(topic, level)) continue;
        for (const direction of directions) {
          specs.push({
            id: situationId(topic, level, direction, variant),
            topic,
            level,
            direction,
            variant,
          });
        }
      }
    }
  }
  return specs;
}
