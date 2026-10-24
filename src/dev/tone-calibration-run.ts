import type { ClipGenerationClient } from '@/lib/clips/generator';
import { ttsInstructionsFor } from '@/lib/clips/tts-instructions';
import { AudioClipSpec, clipIdFor, GeneratedClip } from '@/lib/clips/types';
import { KALIBRIER_WOERTER, type KalibrierWort } from '@/data/tone-calibration-words';

/**
 * Ablauf des Thai-Kalibrierlaufs (24.10.2026) — ohne Oberfläche, damit er
 * mit einem nachgestellten Client testbar ist. Je Stimme: Ablage leeren,
 * jedes Wort des festen Satzes erzeugen, beim Helper ablegen. Der Lauf ist
 * der einzige bezahlte Teil; gestartet wird er nur vom Nutzer im Studio.
 */

export type KalibrierAblage = {
  start(voice: string, model: string, instructionsId?: string): Promise<void>;
  clip(voice: string, wort: KalibrierWort, clip: GeneratedClip): Promise<void>;
};

export type KalibrierFortschritt = { voice: string; fertig: number; gesamt: number; fehler: number };

export type KalibrierErgebnis = {
  erzeugt: number;
  fehler: { voice: string; wordId: string; message: string }[];
  /** Stimmen, die nach lauter Fehlschlägen zu Beginn abgebrochen wurden. */
  abgebrochen: string[];
  vomNutzerAbgebrochen: boolean;
};

/** Bricht eine Stimme ab, wenn die ersten so vielen Wörter alle scheitern (Schlüssel, Modell, Kontingent). */
export const FRUEHER_ABBRUCH = 5;

export function kalibrierSpec(wort: KalibrierWort): AudioClipSpec {
  return { id: clipIdFor('th', wort.term), language: 'th', text: wort.term, kind: 'vocab', sourceId: wort.id };
}

export async function fahreKalibrierung(optionen: {
  voices: readonly string[];
  model: string;
  makeClient: (voice: string) => ClipGenerationClient;
  ablage: KalibrierAblage;
  woerter?: readonly KalibrierWort[];
  parallel?: number;
  onProgress?: (stand: KalibrierFortschritt) => void;
  shouldCancel?: () => boolean;
}): Promise<KalibrierErgebnis> {
  const woerter = optionen.woerter ?? KALIBRIER_WOERTER;
  const parallel = Math.max(1, Math.min(8, optionen.parallel ?? 4));
  const ergebnis: KalibrierErgebnis = { erzeugt: 0, fehler: [], abgebrochen: [], vomNutzerAbgebrochen: false };
  const instructionsId = ttsInstructionsFor({ language: 'th', kind: 'vocab' }, 'gemini')?.id;

  for (const voice of optionen.voices) {
    if (optionen.shouldCancel?.()) { ergebnis.vomNutzerAbgebrochen = true; break; }
    await optionen.ablage.start(voice, optionen.model, instructionsId);
    const client = optionen.makeClient(voice);
    let naechstes = 0;
    let fertig = 0;
    let fehler = 0;
    let erfolge = 0;
    let stimmeAbbrechen = false;
    const melde = () => optionen.onProgress?.({ voice, fertig, gesamt: woerter.length, fehler });
    melde();
    const arbeiter = async () => {
      while (naechstes < woerter.length && !stimmeAbbrechen) {
        if (optionen.shouldCancel?.()) { ergebnis.vomNutzerAbgebrochen = true; return; }
        const wort = woerter[naechstes++];
        try {
          const clip = await client.generate(kalibrierSpec(wort));
          await optionen.ablage.clip(voice, wort, clip);
          erfolge += 1;
          ergebnis.erzeugt += 1;
        } catch (error) {
          fehler += 1;
          ergebnis.fehler.push({ voice, wordId: wort.id, message: error instanceof Error ? error.message : String(error) });
          if (erfolge === 0 && fehler >= FRUEHER_ABBRUCH) stimmeAbbrechen = true;
        }
        fertig += 1;
        melde();
      }
    };
    await Promise.all(Array.from({ length: parallel }, arbeiter));
    if (stimmeAbbrechen) ergebnis.abgebrochen.push(voice);
    if (ergebnis.vomNutzerAbgebrochen) break;
  }
  return ergebnis;
}
