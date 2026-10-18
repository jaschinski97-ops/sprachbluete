import type { BridgeEntry, VocabEntry } from '@/data/vocab-types';
import { vocabularyIdsFor } from '@/data/active-vocabulary';

import { ensureLanguages } from './content/catalog-languages';
import { isLanguageLoaded } from './content/catalog-state';
import { createCardState, dueCards } from './fsrs/fsrs';
import { FSRSCardState } from './fsrs/types';
import { directionLabel } from './languages/registry';
import {
  anchorOf,
  directionsFor,
  LanguageCode,
  PairDirection,
  targetLanguageOf,
} from './languages/types';
import { stageOfEntry, type LearningStage } from './learning-stages';
import { loadCardStatesForDirection, loadVocabulary, seedVocabulary } from './repository';
import { DataStore, getStore } from './storage';

/**
 * Zusammenstellung einer Lernsitzung.
 *
 * Die beiden Lernrichtungen werden strikt getrennt gehalten: eine Sitzung
 * fragt entweder Deutsch -> Thai oder Thai -> Deutsch ab, nie beides
 * durcheinander. Jede Vokabel hat deshalb zwei eigene Karten mit eigenem
 * FSRS-Zustand.
 *
 * SEIT STUFE 1 (2026-09-10) AUCH KREUZRICHTUNGEN: Paare ohne Deutsch
 * (th↔en, th↔es, en↔es) koppeln Brückenwort und Zielwort über `concept` —
 * die Begriffs-ID, über die en/es-Einträge ohnehin auf ihren Thai-Anker
 * verweisen. Ohne Concept-Partner gibt es keinen Kartenstoff: Ehrlichkeit
 * geht vor Vollzahl.
 *
 * SEIT DEM AR-PILOTEN (2026-09-10), SEIT DEM 20-SPRACHEN-AUSBAU (13.09.2026)
 * FÜR ALLE FREMD-BRÜCKEN: Die Richtungen `ar_to_X`, `zh_to_X` & Co. koppeln
 * gegen den generierten Brücken-Pool (Ankerwörter der Oberflächensprache,
 * siehe generate-bridge-vocab.cjs und `src/data/bridge-pools.ts`) — dieselbe
 * concept-Kopplung, nur kommt die Brückenseite nicht aus dem Vokabel-Bestand,
 * sondern aus dem Brücken-Pool. `*_to_de` koppelt seit „Füge noch Deutsch zum
 * Generieren hinzu" (Nutzerentscheidung 10.09.) gegen den ABGELEITETEN
 * de-Pool (`VOCABULARY_DE`) — die deutsche Rückseite ist der `german`-Text
 * des Ankers derselben Begriffs-ID. Die übrigen X_to_de-Richtungen
 * (th/en/es_to_de) laufen unverändert über den Bestandsweg: deren Karten
 * fragen das `german`-Feld der Pool-Einträge ab.
 */

export { directionLabel, directionsFor };

export type ReviewItem = {
  entry: VocabEntry;
  card: FSRSCardState;
  /**
   * Die Vorderseite: das Wort in der ANKERsprache (`translations[anker]`),
   * `null`, wenn der Eintrag keine Übersetzung trägt — dann baut die Karte
   * ihre Vorderseite aus der deutschen Bedeutung.
   */
  bridgeEntry: BridgeEntry | null;
};

/**
 * Sorgt dafür, dass zu jeder Vokabel eine Karte in dieser Richtung existiert.
 *
 * SPRACH-UMBAU 23.09.2026 — EIN WEG FÜR JEDE RICHTUNG: Der Kartenstoff ist
 * der Wortschatz der ZIELsprache (`anker_to_ziel` → Einträge mit
 * `language === ziel`), die Vorderseite liest `translations[anker]`. Vorher
 * gab es vier Zweige (de-geankert, Kreuzrichtung über `concept`,
 * Fremd-Brücke über Brücken-Pools, Fremd-Brücke → abgeleiteter de-Pool) für
 * den alten, festen Grundstock.
 *
 * Neue Karten werden in EINEM Schreibvorgang angelegt, nicht einzeln —
 * `putMany` fasst das nativ in einer Transaktion zusammen.
 */
export async function ensureCardStates(
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now()
): Promise<{ entries: VocabEntry[]; cards: FSRSCardState[] }> {
  const db = store ?? (await getStore());
  // Katalog je Lernsprache: Eine Sitzung braucht ihre Sprache geladen. Die
  // Bildschirme laden sie selbst vorher; das hier fängt jeden anderen Weg ab.
  await ensureLanguages([targetLanguageOf(direction)]);

  let alle = await loadVocabulary(db);
  if (alle.length === 0) {
    // Erster Start: der Wortschatz ist noch nicht im Speicher.
    await seedVocabulary(db);
    alle = await loadVocabulary(db);
  }

  // Die entscheidende Zeile: Ohne diesen Filter bekäme eine Thai-Sitzung
  // Karten für spanische Vokabeln, und die Fälligkeitszahl wäre die Summe
  // über alle Sprachen. Die Sprache steht in der Richtung.
  const ziel = targetLanguageOf(direction);
  const entries = alle
    .filter((entry) => String(entry.language) === ziel)
    // Deutsch als Ziel: `german` ist bei deutschen Einträgen nur ein
    // Synonym — Karten und Übungen lesen dort die Zielform selbst.
    .map((entry) => (ziel === 'de' ? { ...entry, german: entry.term } : entry))
    // Neue Karten kommen in Erzeugungsreihenfolge (der Erzeuger schreibt
    // häufige Wörter zuerst) — dieselbe Ordnung wie die Wortschatz-Meilensteine
    // in stats.ts. Vorher bestimmte die Speicherreihenfolge, und Anfänger
    // bekamen „Zehennagel“ vor „Hallo“.
    .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0) || a.id.localeCompare(b.id));

  const existing = await loadCardStatesForDirection(direction, db);
  const byVocabId = new Map(existing.map((card) => [card.vocabId, card]));

  const missing = entries
    .filter((entry) => !byVocabId.has(entry.id))
    .map((entry) => createCardState(entry.id, direction, now));

  if (missing.length > 0) {
    await db.putMany(
      'cards',
      missing.map((card) => ({ id: `${card.vocabId}:${card.direction}`, value: card }))
    );
    missing.forEach((card) => byVocabId.set(card.vocabId, card));
  }

  return {
    entries,
    cards: entries.map((entry) => byVocabId.get(entry.id)!),
  };
}

/**
 * Die Vorderseite einer Karte: das Wort in der ANKERsprache. Fehlt die
 * Übersetzung, bleibt es bei `null` — die Karte fällt dann auf die deutsche
 * Bedeutung zurück (älterer Bestand).
 */
function ankerSeite(entry: VocabEntry, direction: PairDirection): BridgeEntry | null {
  const anker = anchorOf(direction);
  const term = entry.translations?.[anker];
  if (!term) return null;
  return { id: `${entry.id}:${anker}`, concept: entry.concept ?? entry.id, term };
}

/**
 * Die fälligen Karten einer Richtung, am ehesten Vergessenes zuerst.
 *
 * Die Sortierung nach aufsteigender Retrievability kommt aus `dueCards` und
 * deckt beide Fälle ohne Sonderlogik ab: im Alltag stehen die schwächsten
 * Karten vorn, und nach einer längeren Pause zuerst das, was am tiefsten
 * abgesackt ist.
 */
export async function buildReviewQueue(
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now(),
  onlyVocabIds?: ReadonlySet<string>,
  /**
   * Die im Lern-Reiter gewählte Stufe (18.10.2026): NEUE Karten kommen nur
   * aus ihr. Begonnene Karten bleiben fällig, gleich welcher Stufe — sonst
   * verschwände Gelerntes mit dem Stufenschalter. Ohne Stufe (Kapitel) gilt
   * der ganze Pool.
   */
  stage?: LearningStage
): Promise<ReviewItem[]> {
  const { entries, cards } = await ensureCardStates(direction, store, now);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pool = cards.filter((card) => {
    if (onlyVocabIds && !onlyVocabIds.has(card.vocabId)) return false;
    if (!stage || card.state !== 'new') return true;
    const entry = byId.get(card.vocabId);
    return entry !== undefined && stageOfEntry(entry) === stage;
  });

  return dueCards(pool, now)
    .map((card) => {
      const entry = byId.get(card.vocabId);
      if (!entry) return null;
      return { entry, card, bridgeEntry: ankerSeite(entry, direction) };
    })
    .filter((item): item is ReviewItem => item !== null);
}

export type DirectionSummary = {
  direction: PairDirection;
  due: number;
  total: number;
  /** Karten, die noch nie bewertet wurden. */
  fresh: number;
  /** Stabilität über 21 Tage. */
  mastered: number;
};

/**
 * Die Karten einer Richtung NUR LESEND: Wörter aus dem Index (gilt für jede
 * Sprache, auch ungeladene), Kartenstände aus dem Speicher, fehlende Karten
 * als neu — aber nichts wird angelegt. Das holt `ensureCardStates` nach,
 * sobald die Sprache aktiv ist. Für Zählungen gleichwertig (Vergleichstest).
 */
export async function readCardStates(
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now()
): Promise<{ cards: FSRSCardState[] }> {
  const db = store ?? (await getStore());
  const existing = await loadCardStatesForDirection(direction, db);
  const byVocabId = new Map(existing.map((card) => [card.vocabId, card]));
  return {
    cards: vocabularyIdsFor(targetLanguageOf(direction)).map(
      (id) => byVocabId.get(id) ?? createCardState(id, direction, now)
    ),
  };
}

/** Kennzahlen je Richtung — das Dashboard zeigt sie bewusst getrennt. */
export async function summarizeDirection(
  // SEIT DEN KREUZRICHTUNGEN AUF `PairDirection`: Auch Kreuz-Ziele bekommen
  // ehrliche Fälligkeitszahlen — über die gekoppelten Karten, nie über den
  // vollen Ziel-Pool. `summarizeAllDirections` bleibt beim de-geankerten
  // Bestand (Fortschritts-Reiter).
  direction: PairDirection,
  store?: DataStore,
  now: number = Date.now()
): Promise<DirectionSummary> {
  // Die Übersicht zählt alle Ziele der Oberfläche. Eine ungeladene Sprache
  // (App-Build, Katalog je Lernsprache) wird dafür nicht geladen: Die Zahlen
  // kommen lesend aus dem Index und den gespeicherten Karten.
  const { cards } = isLanguageLoaded(targetLanguageOf(direction))
    ? await ensureCardStates(direction, store, now)
    : await readCardStates(direction, store, now);
  return {
    direction,
    due: dueCards(cards, now).length,
    total: cards.length,
    fresh: cards.filter((card) => card.state === 'new').length,
    mastered: cards.filter((card) => card.state === 'mastered').length,
  };
}

/**
 * Kennzahlen beider Richtungen einer Sprache.
 *
 * SEIT PHASE 16 MIT SPRACHE: Ohne sie zeigte die Uebersicht nach einem Wechsel
 * auf Spanisch weiter die Thai-Zahlen - und zwar ohne dass etwas kaputt
 * aussaehe, was die schlimmere Art Fehler ist.
 */
export async function summarizeAllDirections(
  language: LanguageCode = 'th',
  store?: DataStore,
  now: number = Date.now()
): Promise<DirectionSummary[]> {
  const summaries: DirectionSummary[] = [];
  for (const direction of directionsFor(language)) {
    summaries.push(await summarizeDirection(direction, store, now));
  }
  return summaries;
}
