import type { Tone } from '@/constants/tones';

import { normalizeClipText } from '../clips/types';
import { sollToeneAusSchrift } from '../thai/tone-rules';

import { tonfolgeAusRoman } from './roman-tone';

/**
 * Soll-Töne fürs Audio-Ton-Gate aus Schrift UND Umschrift (24.10.2026).
 *
 * Die Regel-Engine (`thai/tone-rules.ts`) rechnet den Ton jeder Silbe aus der
 * Thai-Schrift nach. Das Gate prüft nur gegen Töne, denen die Schrift nicht
 * widerspricht:
 * - Schrift und Umschrift stimmen überein (wo die Schrift sicher ist) →
 *   Soll-Töne aus der Umschrift, Silben aus der Umschrift.
 * - Schrift widerspricht der Umschrift → „strittig“: Das Gate wertet dann
 *   nicht (ungeprüft), denn ein falscher Soll-Ton darf nie einen bezahlten
 *   Clip verwerfen.
 * - Nicht bestimmbar (keine Umschrift, keine Ausrichtung) → `null`; dann
 *   bleibt es beim bisherigen Weg des Gates.
 *
 * Neu dadurch prüfbar: Dialogzeilen (`turn`), die vorher immer ungeprüft blieben.
 */

export type SollAusSchrift =
  | { art: 'ok'; sollToene: Tone[]; sollRoman: string[] }
  | { art: 'strittig'; grund: string };

export type SchriftClip = { language: string; kind: string; text: string; sourceId?: string };
export type SchriftWort = { id: string; term: string; romanization?: string; exampleTerm?: string; exampleRoman?: string };
export type SchriftSituation = { scriptTurns?: readonly { targetText?: string; thai: string; roman: string }[] };

/** Abgleich eines Thai-Textes mit seiner Umschrift. */
export function sollAusSchriftUndUmschrift(thai: string, roman: string, kontext: 'wort' | 'satz'): SollAusSchrift | null {
  const silben = roman.split(/[-\s]+/).filter(Boolean);
  const toene = tonfolgeAusRoman(roman);
  if (!toene || toene.length !== silben.length) return null;
  const schrift = sollToeneAusSchrift(thai, roman, kontext);
  if (!schrift || schrift.length !== silben.length) return null;
  const widerspruch = schrift.findIndex((ton, i) => ton !== null && ton !== toene[i]);
  if (widerspruch >= 0) {
    return { art: 'strittig', grund: `Silbe ${widerspruch + 1} „${silben[widerspruch]}“: Schrift ergibt ${schrift[widerspruch]}, Umschrift ${toene[widerspruch]}.` };
  }
  return { art: 'ok', sollToene: toene, sollRoman: silben };
}

/** Thai-Text und Umschrift eines Clips aus Wortschatz bzw. Dialogen. */
export function textUndUmschriftFuerClip(
  clip: SchriftClip,
  woerter: readonly SchriftWort[],
  situationen: readonly SchriftSituation[] = []
): { thai: string; roman: string; kontext: 'wort' | 'satz' } | null {
  if (clip.language !== 'th') return null;
  const text = normalizeClipText(clip.text);
  if (clip.kind === 'vocab') {
    const wort = woerter.find((w) => w.id === clip.sourceId && normalizeClipText(w.term) === text);
    return wort?.romanization ? { thai: wort.term, roman: wort.romanization, kontext: 'wort' } : null;
  }
  if (clip.kind === 'example') {
    const wort = woerter.find((w) => w.id === clip.sourceId && w.exampleTerm && normalizeClipText(w.exampleTerm) === text);
    return wort?.exampleTerm && wort.exampleRoman ? { thai: wort.exampleTerm, roman: wort.exampleRoman, kontext: 'satz' } : null;
  }
  if (clip.kind === 'turn') {
    for (const situation of situationen) {
      const zug = situation.scriptTurns?.find((t) => normalizeClipText(t.targetText ?? t.thai) === text);
      if (zug?.roman) return { thai: zug.targetText ?? zug.thai, roman: zug.roman, kontext: 'satz' };
    }
  }
  return null;
}

/** Beides zusammen: Soll-Töne eines Clips aus Schrift und Umschrift, oder `null`. */
export function sollToeneFuerClipAusSchrift(
  clip: SchriftClip,
  woerter: readonly SchriftWort[],
  situationen: readonly SchriftSituation[] = []
): SollAusSchrift | null {
  const quelle = textUndUmschriftFuerClip(clip, woerter, situationen);
  return quelle ? sollAusSchriftUndUmschrift(quelle.thai, quelle.roman, quelle.kontext) : null;
}
