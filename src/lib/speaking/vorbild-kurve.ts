import { medianReferenceHz, octaveCorrect, semitones, voicedRuns, type F0Frame } from './analysis';

/**
 * Melodiekurve eines Satzes (28.10.2026, Shadowing-Vergleich).
 *
 * Vorbild und Lernende werden mit DERSELBEN Funktion beschrieben: Das Skript
 * `scripts/content/vorbild-kurven.cjs` rechnet sie für jeden Satz-Clip vorab
 * aus (die App kann mp3 nicht selbst dekodieren), die App für die eigene
 * Aufnahme. Grundlage ist die F0-Messung der Sprechübung (`analysis.ts`).
 *
 * Eine Kurve ist eine Folge von Halbtonwerten je `KURVEN_SCHRITT_MS`,
 * relativ zum Median der eigenen Stimme (so passen hohe und tiefe Stimmen
 * zusammen), `null` = stimmlos (Pause, Konsonant). Anfang und Ende sind auf
 * die erste/letzte stimmhafte Stelle beschnitten.
 */

export const KURVEN_SCHRITT_MS = 20;
/** Werte außerhalb ±12 Halbtöne sind fast immer Messfehler; sie werden gekappt. */
export const KURVEN_GRENZE = 12;
/** Mindestens so viele stimmhafte Stellen, sonst gibt es keine Kurve. */
export const KURVE_MIN_STIMMHAFT = 5;

export type Kurve = (number | null)[];

/** Messfenster → Kurve. `null`, wenn zu wenig stimmhaft ist. */
export function kurveAusFrames(frames: readonly F0Frame[]): Kurve | null {
  // Kurze Ausreißer (< 4 Fenster) fallen weg, jeder Zug wird einzeln
  // oktavkorrigiert — wie in der Tonprüfung.
  const zuege = voicedRuns(frames).map((zug) => octaveCorrect(zug));
  const stimmhaft = zuege.flat();
  if (stimmhaft.length < 2) return null;
  const referenz = medianReferenceHz(stimmhaft);

  const summen = new Map<number, { summe: number; anzahl: number }>();
  for (const frame of stimmhaft) {
    const fach = Math.floor((frame.t * 1000) / KURVEN_SCHRITT_MS);
    const wert = semitones(frame.f0, referenz);
    const bisher = summen.get(fach) ?? { summe: 0, anzahl: 0 };
    summen.set(fach, { summe: bisher.summe + wert, anzahl: bisher.anzahl + 1 });
  }
  const faecher = [...summen.keys()].sort((a, b) => a - b);
  if (faecher.length < KURVE_MIN_STIMMHAFT) return null;
  const erstes = faecher[0];
  const letztes = faecher[faecher.length - 1];
  const kurve: Kurve = [];
  for (let fach = erstes; fach <= letztes; fach++) {
    const eintrag = summen.get(fach);
    kurve.push(eintrag ? runde(eintrag.summe / eintrag.anzahl) : null);
  }
  return kurve;
}

/** Auf halbe Halbtöne gerundet und gekappt — mehr gibt die Messung nicht her. */
function runde(wert: number): number {
  const gekappt = Math.max(-KURVEN_GRENZE, Math.min(KURVEN_GRENZE, wert));
  return Math.round(gekappt * 2) / 2;
}

// --------------------------------------------------------------- Kodierung
//
// Je Stelle ein Zeichen: a–z, A–Z stehen für −12 … +12 in halben Halbtönen
// (49 Werte), „.“ für stimmlos. Ein Satz von 3 s sind 150 Zeichen.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STUFEN = KURVEN_GRENZE * 4 + 1;

export function kodiereKurve(kurve: Kurve): string {
  return kurve
    .map((wert) => (wert === null ? '.' : ALPHABET[Math.round((runde(wert) + KURVEN_GRENZE) * 2)]))
    .join('');
}

export function dekodiereKurve(text: string): Kurve {
  const kurve: Kurve = [];
  for (const zeichen of text) {
    if (zeichen === '.') {
      kurve.push(null);
      continue;
    }
    const stufe = ALPHABET.indexOf(zeichen);
    if (stufe < 0 || stufe >= STUFEN) throw new Error(`Ungültiges Kurvenzeichen: ${zeichen}`);
    kurve.push(stufe / 2 - KURVEN_GRENZE);
  }
  return kurve;
}

/** Dauer der Kurve in Millisekunden (erste bis letzte stimmhafte Stelle). */
export function kurvenDauerMs(kurve: Kurve): number {
  return kurve.length * KURVEN_SCHRITT_MS;
}

/**
 * Silbengrenzen eines Thai-Vorbilds in Kurvenstellen: je Silbe [von, bis]
 * (inklusive), relativ zum Kurvenanfang. Aus der Silbenausrichtung der
 * Tonprüfung (`richteSilbenAus`), nur im Skript berechnet.
 */
export type SilbenSpannen = [number, number][];

/** Rechnet Silben-Fenster (Zeit in s) in Kurvenstellen um. */
export function silbenSpannenAus(segmente: readonly (readonly F0Frame[])[], frames: readonly F0Frame[]): SilbenSpannen | null {
  const zuege = voicedRuns(frames).flat();
  if (!zuege.length || !segmente.length) return null;
  const start = Math.floor((zuege[0].t * 1000) / KURVEN_SCHRITT_MS);
  const spannen: SilbenSpannen = [];
  for (const segment of segmente) {
    if (!segment.length) return null;
    const von = Math.floor((segment[0].t * 1000) / KURVEN_SCHRITT_MS) - start;
    const bis = Math.floor((segment[segment.length - 1].t * 1000) / KURVEN_SCHRITT_MS) - start;
    spannen.push([Math.max(0, von), Math.max(0, bis)]);
  }
  return spannen;
}

/**
 * Umschrift → Silben (ohne Satzzeichen), so wie die Tonprüfung sie liest.
 * Skript und App zählen damit dieselben Silben wie die Silbengrenzen.
 */
export function romanSilben(roman: string): string[] {
  return roman
    .replace(/[.,!?;:“”"'()…–—]/g, ' ')
    .split(/[-\s]+/)
    .filter(Boolean);
}
