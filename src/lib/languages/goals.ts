import { vocabularyCountFor } from '@/data/active-vocabulary';
import { UI_LANGUAGES } from '@/lib/i18n/types';

import { LEARNING_LANGUAGES } from './definitions';
import {
  ForeignBridge,
  isForeignBridge,
  Lang,
  LanguageCode,
  LANGUAGE_CODES,
  PairDirection,
  targetLanguageOf,
} from './types';

/**
 * Das Lernziel — die Wahl der lernenden Person als „Sprache“.
 *
 * NUTZERENTSCHEIDUNG (2026-09-10): Keine Richtungs-Formulierungen („Deutsch
 * → Thai“) in der Oberfläche — gewählt wird eine SPRACHE. Intern bleibt
 * alles richtungsbasiert (Kartenschlüssel `vocabId:direction`, FSRS, Clips):
 * Jedes Lernziel IST genau eine Richtung `anker_to_ziel`, der Anker ist die
 * App-Sprache.
 *
 * SPRACH-UMBAU 23.09.2026: Ein Ziel ist jetzt schlicht JEDE Lernsprache
 * außer der App-Sprache selbst — für alle 20 App-Sprachen nach derselben
 * Regel. Deutsch ist eine Lernsprache wie jede andere (vorher Sonderfall
 * `_to_de` mit eigenem Pool und eigener Zählung). Eine neue Lernsprache in
 * `LANGUAGE_CODES` erscheint damit automatisch in jeder Oberfläche.
 */
export type Lernziel = {
  /** Die Richtung, die intern alles trägt — sie wird nie als solche angezeigt. */
  direction: PairDirection;
  /** Die gelernte Sprache — die rechte Seite der Richtung. */
  language: LanguageCode;
};

/**
 * Die Ziele einer App-Sprache — „Was kann jemand mit dieser Oberfläche
 * lernen?“: jede Lernsprache außer der App-Sprache selbst.
 *
 * REIHENFOLGE: Auf Oberflächen, die selbst keine Lernsprache sind (ar, zh,
 * hi …), steht Deutsch vorn (Nutzerentscheidung im ar-Piloten 10.09.); sonst
 * gilt die Reihenfolge von `LANGUAGE_CODES`.
 */
export function zieleFuerBruecke(bridge: Lang | ForeignBridge): Lernziel[] {
  const reihenfolge: readonly LanguageCode[] = isForeignBridge(bridge)
    ? ['de', ...LANGUAGE_CODES.filter((code) => code !== 'de')]
    : LANGUAGE_CODES;
  // Die App-Sprache selbst ist nie Ziel — auch nicht „Thai (von Deutsch)“
  // auf Thai-Oberfläche: Dort war die Bedeutung identisch mit dem Thai-Text
  // (Testlauf 08.10.2026, Nutzerentscheidung).
  return reihenfolge
    .filter((code) => code !== bridge)
    .map((code) => ({ direction: `${bridge}_to_${code}` as PairDirection, language: code }));
}

/**
 * Die Richtung eines gemerkten Standes, passend zur AKTUELLEN App-Sprache.
 *
 * Gehört die Richtung zu den Zielen der Oberfläche, bleibt sie. Sonst (App-
 * Sprache gewechselt) gilt dieselbe ZIELsprache auf der neuen Oberfläche
 * (`de_to_es` auf englischer Oberfläche → `en_to_es`); gibt es die dort nicht
 * (die Zielsprache ist jetzt die App-Sprache selbst), das erste Ziel.
 */
export function directionForBridge(bridge: Lang | ForeignBridge, direction: PairDirection): PairDirection {
  const goals = zieleFuerBruecke(bridge);
  const direkt = goals.find(goal => goal.direction === direction);
  if (direkt) return direkt.direction;
  const ziel = targetLanguageOf(direction);
  if (ziel !== bridge) {
    const passend = goals.find(goal => goal.language === ziel);
    if (passend) return passend.direction;
  }
  return goals[0].direction;
}

const ALLE_ZIELE: readonly Lernziel[] = UI_LANGUAGES.flatMap((ui) => zieleFuerBruecke(ui as Lang | ForeignBridge));

export function zielFuerDirection(direction: PairDirection): Lernziel | null {
  return ALLE_ZIELE.find((ziel) => ziel.direction === direction) ?? null;
}

/** Die Sprache, die das Ziel lehrt. */
export function goalLanguage(ziel: Lernziel): LanguageCode {
  return ziel.language;
}

/** Eigenbezeichnung der gelernten Sprache (aus `definitions.ts`). */
export function goalEndonym(ziel: Lernziel): string {
  return LEARNING_LANGUAGES[ziel.language].endonym;
}

/** Wie viele Wörter ein Ziel hat: der Wortschatz seiner Zielsprache (aus dem Index, auch ungeladen). */
export function wortschatzFuerZiel(ziel: Lernziel): number {
  return vocabularyCountFor(ziel.language);
}

/**
 * Das Ziel, mit dem die Übersicht startet — und damit die Lernsprache, die
 * das Ladetor beim Start lädt (Katalog je Lernsprache). Eine Funktion für
 * beide, damit Ladetor und Übersicht nie verschiedene Sprachen meinen.
 *
 * Reihenfolge: eine ausdrückliche Wahl, sonst der gemerkte Lernstand (auf die
 * aktuelle Oberfläche umgelegt), sonst die Profil-Sprache. Nie die eigene
 * Oberflächensprache vorwählen: Die Profil-Sprache ist anfangs 'th', und
 * eine Thai-Oberfläche begann sonst mit „Thai lernen“ (Testlauf 08.10.2026).
 */
export function defaultGoalDirection(
  bridge: Lang | ForeignBridge,
  profile: { language: LanguageCode; review: { direction: PairDirection } | null } | null,
  chosen: PairDirection | null = null
): PairDirection {
  const requested = chosen ?? profile?.review?.direction ?? null;
  if (requested) return directionForBridge(bridge, requested);
  const ziele = zieleFuerBruecke(bridge);
  return (ziele.find(ziel => ziel.language === profile?.language && ziel.language !== bridge)
    ?? ziele.find(ziel => ziel.language !== bridge)
    ?? ziele[0]).direction;
}
