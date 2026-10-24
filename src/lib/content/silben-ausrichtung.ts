/**
 * Silben-Ausrichtung für das Ton-Gate (24.10.2026, `f0-syllables-6`).
 *
 * VORHER zählte das Gate nur stimmhafte Züge: passte ihre Zahl nicht zur
 * Soll-Silbenzahl, wurde verschmolzen (kleinste Lücke) oder an Energietälern
 * getrennt, sonst blieb der Clip ungeprüft. Das war am alten Korpus der
 * häufigste Grund für „ungeprüft“.
 *
 * JETZT: Die stimmhaften Züge werden an möglichen Energietälern in Stücke
 * zerlegt; eine dynamische Programmierung verteilt die Stücke auf genau so
 * viele Silben, wie der Soll hat. Kosten:
 *   - Grenze an einer stimmlosen Lücke: billig, wenn der Silbenbau dort eine
 *     Lücke erwartet (stimmloser Anlaut, Verschluss im Auslaut);
 *   - Grenze in einem Energietal: teurer, je flacher das Tal;
 *   - Lücke INNERHALB einer Silbe: teurer, je länger sie ist;
 *   - Dauer: weicher Abgleich mit der aus dem Silbenbau erwarteten Länge.
 * Für jede gesetzte Grenze wird gemessen, wie viel teurer die beste
 * Ausrichtung OHNE genau diese Grenze wäre (Abstand). Nur eine Grenze an
 * einer echten Lücke mit deutlichem Abstand gilt als „gemessen“; alles
 * andere ist „geraten“ und darf im Gate nie zu einem Verwurf führen.
 */

import type { F0Frame } from '../speaking/analysis';
import { erwarteteDauer, grenzArt, type GrenzArt, type Silbenbau } from './silbenbau';

/** Mindestlänge eines Stücks in Fenstern (wie `voicedRuns`). */
const MIN_STUECK = 4;
/** Ab diesem Verhältnis (Tal zu leiserer Flanke) ist ein Tal kein Kandidat mehr. */
const TAL_KANDIDAT = 0.8;
/** Kürzeste Lücke (ms), die als stimmlose Grenze zählt. */
const MIN_LUECKE_MS = 20;
/** Gewicht des Dauerabgleichs. */
const DAUER_GEWICHT = 0.8;
/** So viel teurer muss die Ausrichtung ohne eine Grenze sein, damit sie „gemessen“ ist. */
export const GRENZE_SICHER_ABSTAND = 1.5;

type Fuge = { art: 'luecke'; ms: number } | { art: 'tal'; verhaeltnis: number };

export type Ausrichtung = {
  /** Stimmhafte Fenster je Silbe, in Zeitfolge (Objekte aus `frames`). */
  segmente: F0Frame[][];
  /** Je Grenze zwischen Silbe i und i+1. */
  grenzen: { gemessen: boolean; fuge: Fuge['art']; abstand: number }[];
  kosten: number;
};

/** Ein Zug in Stücke an den Energietälern; liefert Stücke und die Täler dazwischen. */
function zerlegeZug(zug: F0Frame[], maxTaeler: number): { stuecke: F0Frame[][]; taeler: number[] } {
  if (zug.length < 2 * MIN_STUECK) return { stuecke: [zug], taeler: [] };
  const kandidaten: { i: number; verhaeltnis: number }[] = [];
  for (let i = MIN_STUECK; i <= zug.length - MIN_STUECK; i++) {
    const tal = zug[i].rms;
    if (tal > zug[i - 1].rms || (i + 1 < zug.length && tal > zug[i + 1].rms)) continue;
    let links = 0;
    for (let j = 0; j < i; j++) links = Math.max(links, zug[j].rms);
    let rechts = 0;
    for (let j = i; j < zug.length; j++) rechts = Math.max(rechts, zug[j].rms);
    const flanke = Math.min(links, rechts);
    const verhaeltnis = flanke > 0 ? tal / flanke : 1;
    if (verhaeltnis < TAL_KANDIDAT) kandidaten.push({ i, verhaeltnis });
  }
  // Tiefste zuerst, mit Mindestabstand zwischen den Tälern.
  kandidaten.sort((a, b) => a.verhaeltnis - b.verhaeltnis);
  const gewaehlt: { i: number; verhaeltnis: number }[] = [];
  for (const kandidat of kandidaten) {
    if (gewaehlt.length >= maxTaeler) break;
    if (gewaehlt.every((g) => Math.abs(g.i - kandidat.i) >= MIN_STUECK)) gewaehlt.push(kandidat);
  }
  gewaehlt.sort((a, b) => a.i - b.i);
  const stuecke: F0Frame[][] = [];
  let anfang = 0;
  for (const g of gewaehlt) {
    stuecke.push(zug.slice(anfang, g.i));
    anfang = g.i;
  }
  stuecke.push(zug.slice(anfang));
  return { stuecke, taeler: gewaehlt.map((g) => g.verhaeltnis) };
}

function grenzKosten(fuge: Fuge, erwartet: GrenzArt): number {
  if (fuge.art === 'luecke') return erwartet === 'luecke' ? 0 : erwartet === 'vielleicht' ? 0.3 : 0.8;
  const flach = 1 + 3 * Math.max(0, fuge.verhaeltnis - 0.3);
  return flach + (erwartet === 'luecke' ? 2 : erwartet === 'vielleicht' ? 0.8 : 0);
}

function innenKosten(fuge: Fuge): number {
  return fuge.art === 'luecke' ? Math.min(4, fuge.ms / 40) : 0;
}

/**
 * Stimmhafte Fenster auf `silben` Silben verteilen. `bau` (gleich lang wie
 * die Silbenzahl) schärft Grenzerwartung und Dauer; ohne Silbenbau gilt jede
 * Grenze als „vielleicht“ und jede Silbe als gleich lang. `null`, wenn es
 * weniger Stücke als Silben gibt.
 */
export function richteSilbenAus(
  zuege: readonly F0Frame[][],
  silben: number,
  bau: readonly Silbenbau[] | null
): Ausrichtung | null {
  if (!zuege.length || silben < 1) return null;
  const stuecke: F0Frame[][] = [];
  const fugen: Fuge[] = [];
  zuege.forEach((zug, nr) => {
    if (nr > 0) {
      const vorher = zuege[nr - 1];
      fugen.push({ art: 'luecke', ms: Math.round((zug[0].t - vorher[vorher.length - 1].t) * 1000) - 10 });
    }
    const { stuecke: teile, taeler } = zerlegeZug(zug, silben + 2);
    teile.forEach((teil, i) => {
      if (i > 0) fugen.push({ art: 'tal', verhaeltnis: taeler[i - 1] });
      stuecke.push(teil);
    });
  });
  // Zu kurze Lücken (unter 20 ms) sind keine stimmlose Grenze, sondern ein Tal.
  for (let i = 0; i < fugen.length; i++) {
    const fuge = fugen[i];
    if (fuge.art === 'luecke' && fuge.ms < MIN_LUECKE_MS) fugen[i] = { art: 'tal', verhaeltnis: 0.3 };
  }
  const n = stuecke.length;
  if (n < silben) return null;
  const erwartet: GrenzArt[] = Array.from({ length: silben - 1 }, (_, k) => (bau ? grenzArt(bau[k], bau[k + 1]) : 'vielleicht'));
  const laengen = stuecke.map((s) => s.length);
  const gesamt = laengen.reduce((a, b) => a + b, 0);
  const gewichte = Array.from({ length: silben }, (_, k) => (bau ? erwarteteDauer(bau[k], k === silben - 1) : 1));
  const gewichtSumme = gewichte.reduce((a, b) => a + b, 0);
  const sollDauer = gewichte.map((g) => (g / gewichtSumme) * gesamt);
  const praefix = [0];
  for (const l of laengen) praefix.push(praefix[praefix.length - 1] + l);
  const innenPraefix = [0];
  for (const fuge of fugen) innenPraefix.push(innenPraefix[innenPraefix.length - 1] + innenKosten(fuge));

  const loese = (verboten: number): { kosten: number; anfaenge: number[] } | null => {
    // dp[k][e]: Silben 0..k-1 decken Stücke 0..e-1.
    const dp = Array.from({ length: silben + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const zurueck = Array.from({ length: silben + 1 }, () => new Int32Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let k = 0; k < silben; k++) {
      for (let s = k; s < n; s++) {
        const basis = dp[k][s];
        if (basis === Infinity) continue;
        let grenze = 0;
        if (k > 0) {
          if (s - 1 === verboten) continue;
          grenze = grenzKosten(fugen[s - 1], erwartet[k - 1]);
        }
        const rest = silben - k - 1;
        for (let e = s + 1; e <= n - rest; e++) {
          const dauer = praefix[e] - praefix[s];
          const innen = innenPraefix[e - 1] - innenPraefix[s];
          const abweichung = Math.log(dauer / sollDauer[k]);
          const wert = basis + grenze + innen + DAUER_GEWICHT * abweichung * abweichung;
          if (wert < dp[k + 1][e]) {
            dp[k + 1][e] = wert;
            zurueck[k + 1][e] = s;
          }
        }
      }
    }
    if (dp[silben][n] === Infinity) return null;
    const anfaenge: number[] = [];
    let e = n;
    for (let k = silben; k > 0; k--) {
      const s = zurueck[k][e];
      anfaenge.unshift(s);
      e = s;
    }
    return { kosten: dp[silben][n], anfaenge };
  };

  const beste = loese(-1);
  if (!beste) return null;
  const segmente = beste.anfaenge.map((s, k) => {
    const e = k + 1 < silben ? beste.anfaenge[k + 1] : n;
    return stuecke.slice(s, e).flat();
  });
  const grenzen = beste.anfaenge.slice(1).map((s) => {
    const fuge = fugen[s - 1];
    const ohne = loese(s - 1);
    const abstand = ohne ? ohne.kosten - beste.kosten : Number.POSITIVE_INFINITY;
    return { gemessen: fuge.art === 'luecke' && abstand >= GRENZE_SICHER_ABSTAND, fuge: fuge.art, abstand };
  });
  return { segmente, grenzen, kosten: beste.kosten };
}
