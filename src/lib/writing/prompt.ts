import { VocabEntry } from '@/data/vocab-types';
import { activeVocabulary } from '@/data/active-vocabulary';

import { anchorOf, type PairDirection, targetLanguageOf } from '../languages/types';

import { WritingLanguage } from './compare';

/**
 * Was bei der freien Eingabe gefragt wird — und was als Antwort zählt.
 *
 * JEDE RICHTUNG `anker_to_ziel`: Das Wort der Ankersprache steht da, die
 * Zielform ist zu schreiben — Thai in Thai-Schrift mit Tonzeichen (AE-39),
 * Deutsch mit Artikel (Genus ist der eigentliche Stolperstein).
 *
 * KEINE ERFUNDENEN ZIELFORMEN: Beide Seiten stehen wortwörtlich im Bestand.
 * Dieses Modul schneidet nur weg, was niemand tippen soll.
 */

export type WritingPrompt = {
  id: string;
  vocabId: string;
  direction: PairDirection;
  /** Sprache der **Antwort** — bestimmt Toleranz und Eingabehilfe. */
  language: WritingLanguage;
  /** Was sichtbar ist. */
  shown: string;
  /** Zweite Zeile unter der Aufgabe, oder `null`. */
  shownHint: string | null;
  /** Alle zulässigen Antworten; bei mehreren Bedeutungen zählt jede. */
  targets: string[];
  /** Die Form, die in der Auflösung steht. */
  solution: string;
  /** Zusatzangaben für die Auflösung (Plural, Stammformen, Hinweis). */
  extras: string[];
};

/**
 * Der Teil eines deutschen Stichworts, den man wirklich tippt.
 *
 * Der Grundstock schreibt Erläuterungen in Klammern — „ich (männlicher
 * Sprecher)" oder „Höflichkeitspartikel (weibliche Sprecherin)". Das ist eine
 * Lesehilfe und keine Zielform; wer sie mittippen müsste, übte Abschreiben
 * statt Produzieren. Die Klammer fällt deshalb weg und steht danach in der
 * Auflösung.
 */
export function typeableGerman(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Mehrere Bedeutungen sind mit Komma getrennt; jede zählt als richtig. */
export function germanTargets(entry: VocabEntry): string[] {
  return entry.german
    .split(',')
    .map((part) => typeableGerman(part))
    .filter(Boolean);
}

function extrasFor(entry: VocabEntry): string[] {
  const extras: string[] = [];
  if (entry.germanNoun) extras.push(`Plural: ${entry.germanNoun.plural}`);
  if (entry.germanVerb) {
    extras.push(
      `${entry.germanVerb.thirdPerson} · ${entry.germanVerb.praeteritum} · ${entry.germanVerb.perfekt}`
    );
  }
  if (entry.germanAdjective) {
    extras.push(`${entry.germanAdjective.comparative} · ${entry.germanAdjective.superlative}`);
  }
  if (entry.note) extras.push(entry.note);
  // C1 (Release-Texte): Die KI-Kreuzprüfung gehört NICHT in die
  // Lernansicht — Erzeugungs-Metadaten (Anbieter-/Modellnamen) und das
  // ⚠ auf jeder Karte sind dort Lärm. Nur echte Altbestands-Vorbehalte
  // („UNSICHER: …") bleiben sichtbar.
  if (entry.verificationNote && !entry.verificationNote.startsWith('KI-')) {
    extras.push(`⚠ ${entry.verificationNote}`);
  }
  return extras;
}

/**
 * Seit dem Sprach-Umbau EIN Weg für jede Richtung: gezeigt wird das Wort der
 * ANKERsprache (`translations[anker]`), getippt wird die Zielform (`term`).
 * Deutsch als Ziel nimmt zusätzlich die Form mit Artikel an. Vorher gab es
 * dafür einen eigenen `_to_de`-Zweig, und nicht-deutsche Oberflächen hatten
 * gar keine Schreibübung.
 */
export function canBuildWritingPrompt(entry: VocabEntry, direction: PairDirection): boolean {
  return zielFormen(entry).length > 0 && ankerwortFuer(entry, direction).length > 0;
}

/** Die tippbaren Zielformen: der Eintrag, bei Aufzählungen jede Form einzeln. */
function zielFormen(entry: VocabEntry): string[] {
  return entry.term.split(',').map((part) => typeableGerman(part)).filter(Boolean);
}

export function ankerwortFuer(entry: VocabEntry, direction: PairDirection): string {
  const anchor = anchorOf(direction);
  if (String(entry.language) === anchor) return entry.term;
  const uebersetzt = (entry.translations?.[anchor] ?? '').trim();
  if (uebersetzt) return uebersetzt;
  // Älterer Bestand ohne Übersetzungen trägt nur die deutsche Bedeutung.
  return anchor === 'de' ? typeableGerman(entry.german.split(',')[0] ?? '') : '';
}

/**
 * Der generierte de-Pool trägt den Artikel NICHT im `term`, der Auftrag
 * verlangt ihn aber („mit Artikel“). Zielform ist deshalb nur die Form MIT
 * Artikel; „Haus“ allein meldet `compareWriting` als fehlenden Artikel.
 * Bis zum 16.10.2026 zählte auch die Form ohne Artikel als „genau richtig“ —
 * entgegen dem Auftrag und Abnahmekriterium 14 in docs/PROGRESS.md.
 */
function mitArtikel(formen: string[], entry: VocabEntry): string[] {
  const noun = entry.germanNoun;
  if (!noun) return formen;
  const erweitert = formen.map((form) =>
    form.toLowerCase().startsWith(`${noun.article} `) ? form : `${noun.article} ${form}`
  );
  return [...new Set(erweitert)];
}

/**
 * Andere Einträge der Zielsprache mit DEMSELBEN Ankerwort — „einfach“ ist
 * simple UND easy, „ประมาณ“ etwa, circa und ungefähr. Wer das Synonym tippt,
 * hat die Aufgabe gelöst; vorher zählte es als Fehler („Nochmal“).
 */
function synonymFormen(entry: VocabEntry, direction: PairDirection, pool: VocabEntry[]): string[] {
  const anker = ankerwortFuer(entry, direction).trim().toLowerCase();
  if (!anker) return [];
  return pool
    .filter((other) => other.id !== entry.id && String(other.language) === String(entry.language))
    .filter((other) => ankerwortFuer(other, direction).trim().toLowerCase() === anker)
    .flatMap((other) => zielFormen(other).map((form) => ({ form, other })))
    .flatMap(({ form, other }) => (targetLanguageOf(direction) === 'de' ? mitArtikel([form], other) : [form]));
}

export function buildWritingPrompt(
  entry: VocabEntry,
  direction: PairDirection,
  /** Der Bestand, aus dem Synonyme mit gleichem Ankerwort gelesen werden. */
  pool: VocabEntry[] = []
): WritingPrompt {
  if (!canBuildWritingPrompt(entry, direction)) {
    throw new Error(`"${entry.id}" hat in Richtung ${direction} keine tippbare Zielform.`);
  }
  const language = targetLanguageOf(direction);
  // 71 Einträge tragen den Artikel schon im Wort („die Stufe“) — nicht doppeln.
  const artikel = language === 'de' && entry.germanNoun && !entry.term.toLowerCase().startsWith(`${entry.germanNoun.article} `)
    ? `${entry.germanNoun.article} ` : '';
  const loesung = `${artikel}${entry.term}`;
  const umschrift = entry.romanization && entry.romanization !== entry.term ? entry.romanization : null;
  const eigene = language === 'de' ? mitArtikel(zielFormen(entry), entry) : zielFormen(entry);

  return {
    id: `writing:${direction}:${entry.id}`,
    vocabId: entry.id,
    direction,
    language,
    shown: ankerwortFuer(entry, direction),
    shownHint: null,
    targets: [...new Set([...eigene, ...synonymFormen(entry, direction, pool)])],
    solution: umschrift ? `${loesung} · ${umschrift}` : loesung,
    extras: extrasFor(entry),
  };
}

/** Alle Einträge der Zielsprache, zu denen es einen Auftrag in der Ankersprache gibt. */
export function writingCandidates(
  direction: PairDirection,
  entries: VocabEntry[] = activeVocabulary()
): VocabEntry[] {
  const sprache = targetLanguageOf(direction);
  return entries.filter(
    (entry) => String(entry.language) === sprache && canBuildWritingPrompt(entry, direction)
  );
}
