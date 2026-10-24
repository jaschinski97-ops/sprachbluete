import { satzaufgabenFuer } from '@/data/sentence-tasks';

import { dictationTasksFor } from './dictation/tasks';
import { hoerDrillFuer } from './languages/definitions';
import { anchorOf, type PairDirection } from './languages/types';
import { targetLanguageOf } from './languages/types';
import type { LearningStage } from './learning-stages';
import { loadReviewLog, type ReviewDayLog } from './review-log';
import { buildReviewQueue, type ReviewItem } from './review-session';
import { type DataStore } from './storage';

/**
 * Die „Heutige Runde“ — eine automatisch zusammengestellte Mischung
 * (Lern-Reiter-Ausbau, Schritt 2, 13.09.2026).
 *
 * WARUM EIN PLANER ALS REINE FUNKTION: Die Zusammensetzung ist der Teil, den
 * man falsch machen kann und den man testen kann — Mischung, Fälligkeit,
 * Gewichtung. Sie liest nur (`AE-16`-Geist): Planer und Läufer sind getrennt,
 * `buildTodayRound` sammelt die Eingaben, `planTodayRound` entscheidet, der
 * Runner (`today-round-runner`) führt aus.
 *
 * DIE MISCHUNG: fällige Karteikarten zuerst (die FSRS-Abstände bleiben
 * unangetastet — dieselben Karten, dieselbe Sortierung wie im Karteikasten),
 * danach Hören, Satz bilden, Diktat und Shadowing, je nach Stoff der Sprache.
 *
 * GEWICHTUNG „schwache Bereiche zuerst“: Aus dem Tagesprotokoll (letzte
 * 7 Tage) kommt je Bereich die Fehlerquote (`schwaecheAusLog`); sie erhöht
 * das Gewicht des Bereichs. Bereiche ohne Daten bekommen das Grundgewicht —
 * fehlende Daten werden nie als Stärke interpretiert.
 */

/** Ziel-Dauer der Runde in Minuten. */
export const ROUND_MINUTES = 10;

/** Zeitansatz je Aufgabe in Minuten — grob, aber deklariert statt versteckt. */
const MINUTEN_PRO_AUFGABE: Record<RoundKind, number> = {
  cards: 0.35,
  hoeren: 0.3,
  satz: 0.5,
  diktat: 0.75,
  shadowing: 0.75,
};

/** Grundgewicht der Mischbereiche — wie oft eine Art ongeprüft drankommt. */
const GRUNDGEWICHT: Record<Exclude<RoundKind, 'cards'>, number> = {
  hoeren: 1,
  satz: 1.2,
  diktat: 1.2,
  shadowing: 1,
};

/** Unterhalb dieser Kartenzahl lohnt ein Karten-Segment kaum. */
export const KARTEN_MAX = 10;

export type RoundKind = 'cards' | 'hoeren' | 'satz' | 'diktat' | 'shadowing';

export type RoundSegment = {
  kind: RoundKind;
  items: number;
};

export type RoundWeakness = { total: number; correct: number };

/** Feste Reihenfolge der Segmente in der Runde. */
const REIHENFOLGE: RoundKind[] = ['cards', 'hoeren', 'satz', 'diktat', 'shadowing'];

export type RoundPlanInput = {
  /** Wie viele Karten heute fällig sind. */
  dueCount: number;
  /** Hat die Sprache für diesen Bereich überhaupt Stoff? */
  verfuegbar: Partial<Record<Exclude<RoundKind, 'cards'>, boolean>>;
  /** Fehlerquoten je Bereich — ohne Eintrag gilt das Grundgewicht. */
  schwaeche?: Partial<Record<RoundKind, RoundWeakness>>;
  zielMinuten?: number;
  maxKarten?: number;
};

/** Fehlerquote als Gewichts-Faktor: 100 % Fehler verdoppelt den Anteil. */
function schwaecheFaktor(schwaeche: RoundWeakness | undefined): number {
  if (!schwaeche || schwaeche.total <= 0) return 1;
  const quote = (schwaeche.total - schwaeche.correct) / schwaeche.total;
  return 1 + Math.min(Math.max(quote, 0), 1);
}

export function planTodayRound(input: RoundPlanInput): RoundSegment[] {
  const ziel = input.zielMinuten ?? ROUND_MINUTES;
  const maxKarten = input.maxKarten ?? KARTEN_MAX;

  // 1) Karten zuerst: die fälligen, gedeckelt — wer Wochen nachholt, soll
  //    trotzdem heute auch die anderen Bereiche sehen.
  const kartenItems = Math.max(0, Math.min(input.dueCount, maxKarten));
  const segmente: RoundSegment[] = kartenItems > 0
    ? [{ kind: 'cards', items: kartenItems }]
    : [];
  let rest = ziel - kartenItems * MINUTEN_PRO_AUFGABE.cards;

  // 2) Mischbereiche nach Gewicht auf die Restzeit verteilen.
  const arten = REIHENFOLGE.filter(
    (kind): kind is Exclude<RoundKind, 'cards'> =>
      kind !== 'cards' && input.verfuegbar[kind] === true
  );
  const gewichte = new Map(
    arten.map((kind) => [kind, GRUNDGEWICHT[kind] * schwaecheFaktor(input.schwaeche?.[kind])])
  );

  // Zu wenig Restzeit: der seltenste Bereich fliegt zuerst raus, bis für
  // mindestens zwei Aufgaben pro verbleibender Art Platz ist.
  let aktiv = [...arten];
  while (
    aktiv.length > 0 &&
    rest < aktiv.reduce((summe, kind) => summe + 2 * MINUTEN_PRO_AUFGABE[kind], 0)
  ) {
    let seltenster = aktiv[0];
    for (const kind of aktiv) {
      if (gewichte.get(kind)! < gewichte.get(seltenster)!) seltenster = kind;
    }
    aktiv = aktiv.filter((kind) => kind !== seltenster);
  }

  const gesamtgewicht = aktiv.reduce((summe, kind) => summe + gewichte.get(kind)!, 0);
  for (const kind of aktiv) {
    const minuten = rest * (gesamtgewicht > 0 ? gewichte.get(kind)! / gesamtgewicht : 0);
    const items = Math.max(2, Math.floor(minuten / MINUTEN_PRO_AUFGABE[kind]));
    segmente.push({ kind, items });
  }

  // 3) Feste Reihenfolge — der Plan liest sich immer gleich.
  return segmente.sort((a, b) => REIHENFOLGE.indexOf(a.kind) - REIHENFOLGE.indexOf(b.kind));
}

/**
 * Fehlerquoten der letzten 7 Tage aus dem Tagesprotokoll.
 *
 * `byDrill` zählt je Aufgaben-Art; die Arten werden hier zu Runden-Bereichen
 * zusammengefasst. Arten ohne Protokoll (Satz produzierbar erst mit „Sag es
 * auf …", Shadowing ohne Bewertung) bleiben ohne Eintrag — Grundgewicht.
 */
export function schwaecheAusLog(
  tage: ReviewDayLog[],
  jetzt: number = Date.now()
): Partial<Record<RoundKind, RoundWeakness>> {
  const siebenTage = new Set<string>();
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(jetzt);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const tag = `${d.getDate()}`.padStart(2, '0');
    siebenTage.add(`${d.getFullYear()}-${m}-${tag}`);
  }

  const summen = new Map<string, RoundWeakness>();
  for (const tag of tage) {
    if (!siebenTage.has(tag.date) || !tag.byDrill) continue;
    for (const [art, stand] of Object.entries(tag.byDrill)) {
      if (!stand) continue;
      const bis = summen.get(art) ?? { total: 0, correct: 0 };
      bis.total += stand.total;
      bis.correct += stand.correct;
      summen.set(art, bis);
    }
  }

  const addiere = (kind: RoundKind, arts: string[]): RoundWeakness | undefined => {
    let total = 0;
    let correct = 0;
    for (const art of arts) {
      const stand = summen.get(art);
      if (!stand) continue;
      total += stand.total;
      correct += stand.correct;
    }
    return total > 0 ? { total, correct } : undefined;
  };

  return {
    hoeren: addiere('hoeren', ['tone', 'stressHear', 'soundSpelling']),
    diktat: addiere('diktat', ['dictation']),
  };
}

/** Hat die Sprache für den Bereich Stoff? (18.09.: je PRODUZIERTER Sprache, auch de) */
export function bereichVerfuegbar(direction: PairDirection, kind: Exclude<RoundKind, 'cards'>): boolean {
  // Die satztragenden Bereiche folgen der produzierten Sprache — im Deutsch-
  // Ziel (th_to_de) sind das deutsche Sätze, nicht die Thai-Ankerseite.
  const sprache = targetLanguageOf(direction);
  switch (kind) {
    case 'hoeren':
      // Nur Sprachen mit eigener Wort-Hörübung (Definition); die anderen
      // hören über „Satz verstehen“ (Bereich satz) mit.
      return hoerDrillFuer(sprache) !== undefined;
    case 'satz':
    case 'shadowing':
      // Nur Sätze mit gelieferter Bedeutung in der App-Sprache (seit
      // 24.10.2026 `exampleTranslations`, auf Deutsch auch `exampleGerman`);
      // ohne sie springt die Runde den Bereich mit „emptySkip“.
      return satzaufgabenFuer(sprache, anchorOf(direction)).some((task) => task.meaning);
    case 'diktat':
      try {
        return dictationTasksFor(sprache, direction).length > 0;
      } catch {
        return false;
      }
  }
}

export type TodayRound = {
  plan: RoundSegment[];
  /** Die fälligen Karten — der Runner arbeitet die ersten `cards.items` ab. */
  due: ReviewItem[];
};

/** Sammelt die Eingaben und lässt den Planer entscheiden (liest nur). */
export async function buildTodayRound(
  direction: PairDirection,
  store?: DataStore,
  jetzt: number = Date.now(),
  /** Neue Karten nur aus dieser Stufe; fällige Wiederholungen aus allen. */
  stage?: LearningStage
): Promise<TodayRound> {
  const due = await buildReviewQueue(direction, store, jetzt, undefined, stage);
  const tage = await loadReviewLog(store);
  const plan = planTodayRound({
    dueCount: due.length,
    verfuegbar: {
      hoeren: bereichVerfuegbar(direction, 'hoeren'),
      satz: bereichVerfuegbar(direction, 'satz'),
      diktat: bereichVerfuegbar(direction, 'diktat'),
      shadowing: bereichVerfuegbar(direction, 'shadowing'),
    },
    schwaeche: schwaecheAusLog(tage, jetzt),
  });
  return { plan, due };
}
