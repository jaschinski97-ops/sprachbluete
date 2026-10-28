import type { LanguageCode } from '../languages/types';
import { vergleichsForm } from './recognition';

/**
 * Welche Wörter des Satzes hat die Spracherkennung gehört? (28.10.2026)
 *
 * Bewusst nur „erkannt“ / „nicht sicher erkannt“, nie „falsch“: Die
 * Erkennung selbst irrt, gerade bei Lernenden und bei Thai-Tönen. Gilt ein
 * Wort als erkannt, wenn es in IRGENDEINER der Varianten vorkommt.
 */

export type WortBefund = { wort: string; erkannt: boolean };

const ohneAkzente = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Thai: Wörter per Segmenter, sonst Leerzeichen-Abschnitte; andere: Leerzeichen. */
export function satzWoerter(satz: string, sprache: LanguageCode): string[] {
  const sauber = satz.replace(/[.,!?;:¿¡"“”„()…–—]/g, ' ').trim();
  if (sprache === 'th' && typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function') {
    const woerter: string[] = [];
    for (const teil of new Intl.Segmenter('th', { granularity: 'word' }).segment(sauber)) {
      if (teil.isWordLike) woerter.push(teil.segment);
    }
    if (woerter.length) return woerter;
  }
  return sauber.split(/\s+/).filter(Boolean);
}

export function pruefeWoerter(satz: string, varianten: readonly string[], sprache: LanguageCode): WortBefund[] {
  const woerter = satzWoerter(satz, sprache);
  if (sprache === 'th') {
    // Thai ohne Leerzeichen vergleichen: Teilstring in irgendeiner Variante.
    const gehoert = varianten.map((v) => vergleichsForm(v).replace(/ /g, ''));
    return woerter.map((wort) => ({
      wort,
      erkannt: gehoert.some((v) => v.includes(vergleichsForm(wort).replace(/ /g, ''))),
    }));
  }
  const gehoert = new Set(
    varianten.flatMap((v) => ohneAkzente(vergleichsForm(v)).split(' ')).filter(Boolean)
  );
  return woerter.map((wort) => ({ wort, erkannt: gehoert.has(ohneAkzente(vergleichsForm(wort))) }));
}
