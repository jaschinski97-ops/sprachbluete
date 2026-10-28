import type { LanguageCode } from '../languages/types';
import { dekodiereKurve, type Kurve, type SilbenSpannen } from './vorbild-kurve';

/**
 * Lädt die Vorbild-Kurven einer Lernsprache (`assets/kurven/<lang>.kurven.yml`)
 * erst, wenn eine Sprechübung sie braucht, und hält sie danach im Speicher.
 * Eine fehlende oder kaputte Datei ist kein Fehler der Übung: Dann gibt es
 * eben keinen Kurvenvergleich, Anhören und Wörter gehen trotzdem.
 */

export type VorbildEintrag = { kurve: Kurve; silben: SilbenSpannen | null };
type Roh = [string, string, SilbenSpannen?];
export type KurvenQuelle = { lies(sprache: LanguageCode): Promise<string> };

const standardQuelle: KurvenQuelle = {
  async lies(sprache) {
    const { KURVEN_DATEIEN } = require('../../content/kurven-dateien') as typeof import('../../content/kurven-dateien');
    const { readCatalogAsset } = require('../content/catalog-loader') as typeof import('../content/catalog-loader');
    return (await readCatalogAsset(KURVEN_DATEIEN[sprache])).text;
  },
};

let quelle: KurvenQuelle = standardQuelle;
const geladen = new Map<LanguageCode, Promise<Record<string, Roh> | null>>();

/** Tests: eigene Daten statt der eingebetteten Dateien (`null` = Standard). */
export function setzeKurvenQuelle(neu: KurvenQuelle | null): void {
  quelle = neu ?? standardQuelle;
  geladen.clear();
}

function lade(sprache: LanguageCode): Promise<Record<string, Roh> | null> {
  let laden = geladen.get(sprache);
  if (!laden) {
    laden = quelle
      .lies(sprache)
      .then((text) => {
        const daten = JSON.parse(text) as { v?: number; kurven?: Record<string, Roh> };
        return daten.v === 1 && daten.kurven ? daten.kurven : null;
      })
      .catch(() => null);
    geladen.set(sprache, laden);
  }
  return laden;
}

/** Vorbild-Kurve zu einem Clip, `null` ohne Daten. */
export async function vorbildKurve(sprache: LanguageCode, clipId: string): Promise<VorbildEintrag | null> {
  const kurven = await lade(sprache);
  const roh = kurven?.[clipId];
  if (!roh) return null;
  try {
    return { kurve: dekodiereKurve(roh[1]), silben: roh[2] ?? null };
  } catch {
    return null;
  }
}
