import type { Tone } from '@/constants/tones';

import { type Kurve, type SilbenSpannen } from './vorbild-kurve';

/**
 * Vergleich eigene Aufnahme ↔ Vorbild (28.10.2026, Shadowing).
 *
 * Bewusst grob und ehrlich: Es werden nur Tonhöhenverlauf (Melodie) und
 * Länge (Tempo) verglichen, nie Laute oder Wörter. Die eigene Kurve wird per
 * Dynamic Time Warping auf die Zeitachse des Vorbilds gelegt, damit eine
 * langsamere Aufnahme nicht automatisch „falsch“ aussieht. Urteile sind
 * Wörter („nah dran“), keine Prozentzahlen, die Genauigkeit vortäuschen.
 */

export type TempoUrteil = 'schneller' | 'passt' | 'langsamer';
export type MelodieUrteil = 'sehr-nah' | 'nah' | 'abweichend';
export type StellenLage = 'anfang' | 'mitte' | 'ende';
export type TippArt =
  | `ton-${Tone}`
  | 'frage-hoch'
  | 'ende-runter'
  | 'mehr-melodie'
  | 'stelle';

export type Stelle = {
  /** Kurvenstellen des Vorbilds, inklusive. */
  von: number;
  bis: number;
  /** Thai: Index der Silbe im Vorbild (zur Umschrift). */
  silbe?: number;
  lage: StellenLage;
  tipp: TippArt;
};

export type VergleichsErgebnis =
  | {
      status: 'ok';
      tempo: { verhaeltnis: number; urteil: TempoUrteil };
      melodie: { abweichung: number; urteil: MelodieUrteil };
      /** Eigene Melodie deutlich flacher als das Vorbild. */
      flach: boolean;
      /** Eigene Kurve auf der Zeitachse des Vorbilds (gleich lang wie das Vorbild). */
      ichAngeglichen: (number | null)[];
      stelle: Stelle | null;
    }
  | { status: 'unpassend'; grund: 'zu-kurz' | 'laenge' };

/**
 * Grenzen in Halbtönen mittlerer Abweichung, geeicht am 28.10.2026 an den
 * Vorbild-Kurven (scripts: Vergleich verschiedener Sätze gegeneinander und
 * eines Satzes gegen verzerrte Kopien): gute Nachahmung 0,5–0,7, ordentliche
 * 1,0–1,3, verschiedene Sätze meist über 1,4 (10. Perzentil 1,1–1,3).
 */
export const MELODIE_SEHR_NAH = 0.8;
export const MELODIE_NAH = 1.3;
/** Eine Stelle wird erst ab dieser geglätteten Abweichung (Halbtöne) gezeigt. */
export const STELLE_AB = 2.5;
/** Tempo: eigene Dauer / Vorbild-Dauer. */
export const TEMPO_SCHNELL = 0.8;
export const TEMPO_LANGSAM = 1.25;

/** Angleichung: Band um die Diagonale (Anteil der Länge) und Strafe je Dehnschritt (Halbtöne). */
export const DTW_BAND = 0.12;
export const DTW_STRAFE = 1;

/** Lücken (stimmlos) innen linear füllen, damit die Angleichung durchläuft. */
export function fuelleLuecken(kurve: Kurve): number[] {
  const werte: number[] = new Array(kurve.length);
  let letzter = -1;
  for (let i = 0; i < kurve.length; i++) {
    const wert = kurve[i];
    if (wert === null) continue;
    if (letzter < 0) {
      for (let j = 0; j < i; j++) werte[j] = wert;
    } else {
      const start = kurve[letzter] as number;
      for (let j = letzter + 1; j < i; j++) werte[j] = start + ((wert - start) * (j - letzter)) / (i - letzter);
    }
    werte[i] = wert;
    letzter = i;
  }
  if (letzter < 0) return new Array(kurve.length).fill(0);
  for (let j = letzter + 1; j < kurve.length; j++) werte[j] = kurve[letzter] as number;
  return werte;
}

/**
 * Dynamic Time Warping mit Band (Sakoe-Chiba). Liefert den Pfad als Paare
 * [i, j] vom Anfang zum Ende. Kosten: Betrag der Halbtondifferenz.
 */
export function angleichen(a: readonly number[], b: readonly number[], strafe: number = DTW_STRAFE): [number, number][] {
  const n = a.length;
  const m = b.length;
  const band = Math.max(8, Math.ceil(DTW_BAND * Math.max(n, m)));
  const INF = Number.POSITIVE_INFINITY;
  const kosten = new Float64Array((n + 1) * (m + 1)).fill(INF);
  const index = (i: number, j: number) => i * (m + 1) + j;
  kosten[index(0, 0)] = 0;
  for (let i = 1; i <= n; i++) {
    // Die Diagonale verläuft von (0,0) nach (n,m); das Band liegt um sie herum.
    const mitte = Math.round((i * m) / n);
    const von = Math.max(1, mitte - band);
    const bis = Math.min(m, mitte + band);
    for (let j = von; j <= bis; j++) {
      const d = Math.abs(a[i - 1] - b[j - 1]);
      // Dehnen/Stauchen kostet extra: sonst biegt sich jede Kurve auf jede.
      const bester = Math.min(kosten[index(i - 1, j - 1)], kosten[index(i - 1, j)] + strafe, kosten[index(i, j - 1)] + strafe);
      kosten[index(i, j)] = d + bester;
    }
  }
  const pfad: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    pfad.push([i - 1, j - 1]);
    const diagonal = kosten[index(i - 1, j - 1)];
    const oben = kosten[index(i - 1, j)] + strafe;
    const links = kosten[index(i, j - 1)] + strafe;
    if (diagonal <= oben && diagonal <= links) {
      i--;
      j--;
    } else if (oben <= links) i--;
    else j--;
  }
  return pfad.reverse();
}

function quantil(werte: readonly number[], q: number): number {
  const sortiert = [...werte].sort((x, y) => x - y);
  return sortiert[Math.min(sortiert.length - 1, Math.max(0, Math.round(q * (sortiert.length - 1))))];
}

/** Spannweite der Melodie (10.–90. Perzentil), robust gegen Ausreißer. */
export function spannweite(kurve: Kurve): number {
  const werte = kurve.filter((w): w is number => w !== null);
  if (werte.length < 3) return 0;
  return quantil(werte, 0.9) - quantil(werte, 0.1);
}

export type VergleichsOptionen = {
  /** Thai: Silbengrenzen des Vorbilds (aus dem Kurven-Skript). */
  silben?: SilbenSpannen | null;
  /** Thai: Sollton je Silbe (gleich lang wie `silben`). */
  toene?: readonly Tone[] | null;
};

export function vergleiche(vorbild: Kurve, ich: Kurve, optionen: VergleichsOptionen = {}): VergleichsErgebnis {
  const stimmhaftIch = ich.filter((w) => w !== null).length;
  if (stimmhaftIch < 5 || ich.length < 10) return { status: 'unpassend', grund: 'zu-kurz' };
  const verhaeltnis = ich.length / vorbild.length;
  // Viel kürzer oder länger: wohl nicht derselbe Satz oder abgebrochen.
  if (verhaeltnis < 0.4 || verhaeltnis > 2.8) return { status: 'unpassend', grund: 'laenge' };

  const a = fuelleLuecken(vorbild);
  const b = fuelleLuecken(ich);
  const pfad = angleichen(a, b);

  // Je Vorbild-Stelle: Mittel der zugeordneten eigenen Werte (nur stimmhafte).
  const summe = new Array<number>(vorbild.length).fill(0);
  const anzahl = new Array<number>(vorbild.length).fill(0);
  for (const [i, j] of pfad) {
    const wert = ich[j];
    if (wert === null) continue;
    summe[i] += wert;
    anzahl[i] += 1;
  }
  const ichAngeglichen = summe.map((s, i) => (anzahl[i] ? s / anzahl[i] : null));

  const abweichungen: (number | null)[] = vorbild.map((wert, i) => {
    const eigen = ichAngeglichen[i];
    return wert === null || eigen === null ? null : Math.abs(wert - eigen);
  });
  const gueltig = abweichungen.filter((d): d is number => d !== null);
  const abweichung = gueltig.length ? gueltig.reduce((s, d) => s + d, 0) / gueltig.length : Infinity;
  const melodieUrteil: MelodieUrteil = abweichung < MELODIE_SEHR_NAH ? 'sehr-nah' : abweichung < MELODIE_NAH ? 'nah' : 'abweichend';

  const spanneVorbild = spannweite(vorbild);
  const flach = spanneVorbild > 3 && spannweite(ich) < 0.55 * spanneVorbild;

  const tempoUrteil: TempoUrteil =
    verhaeltnis < TEMPO_SCHNELL ? 'schneller' : verhaeltnis > TEMPO_LANGSAM ? 'langsamer' : 'passt';

  return {
    status: 'ok',
    tempo: { verhaeltnis, urteil: tempoUrteil },
    melodie: { abweichung, urteil: melodieUrteil },
    flach,
    ichAngeglichen,
    stelle: findeStelle(vorbild, ichAngeglichen, abweichungen, flach, optionen),
  };
}

/** Größte geglättete Abweichung (≈ 100 ms Fenster) und der Tipp dazu. */
function findeStelle(
  vorbild: Kurve,
  ich: (number | null)[],
  abweichungen: (number | null)[],
  flach: boolean,
  optionen: VergleichsOptionen
): Stelle | null {
  const FENSTER = 2;
  let beste = -1;
  let besterWert = 0;
  for (let i = 0; i < abweichungen.length; i++) {
    let s = 0;
    let n = 0;
    for (let k = i - FENSTER; k <= i + FENSTER; k++) {
      const d = abweichungen[k];
      if (d === null || d === undefined) continue;
      s += d;
      n++;
    }
    if (n >= 3 && s / n > besterWert) {
      besterWert = s / n;
      beste = i;
    }
  }
  if (beste < 0 || besterWert < STELLE_AB) {
    // Keine einzelne Stelle, aber insgesamt zu flach: das ist der Tipp.
    return flach ? { von: 0, bis: vorbild.length - 1, lage: 'mitte', tipp: 'mehr-melodie' } : null;
  }

  const lageAus = (i: number): StellenLage => {
    const anteil = i / Math.max(1, vorbild.length - 1);
    return anteil < 0.33 ? 'anfang' : anteil > 0.66 ? 'ende' : 'mitte';
  };

  // THAI: auf die Silbe legen, deren Spanne die Stelle enthält (oder die nächste).
  const { silben, toene } = optionen;
  if (silben && silben.length && toene && toene.length === silben.length) {
    let silbe = 0;
    let abstand = Infinity;
    silben.forEach(([von, bis], nr) => {
      const d = beste < von ? von - beste : beste > bis ? beste - bis : 0;
      if (d < abstand) {
        abstand = d;
        silbe = nr;
      }
    });
    const [von, bis] = silben[silbe];
    return { von, bis, silbe, lage: lageAus(beste), tipp: `ton-${toene[silbe]}` };
  }

  const von = Math.max(0, beste - 6);
  const bis = Math.min(vorbild.length - 1, beste + 6);
  const lage = lageAus(beste);
  // Satzmelodie am Ende: steigt das Vorbild (Frage) oder fällt es deutlich?
  if (lage === 'ende') {
    const steigung = (kurve: (number | null)[]) => {
      const werte = kurve.slice(von, bis + 1).filter((w): w is number => w !== null);
      return werte.length >= 2 ? werte[werte.length - 1] - werte[0] : 0;
    };
    const sv = steigung(vorbild);
    const si = steigung(ich);
    if (sv > 2 && si < sv - 2) return { von, bis, lage, tipp: 'frage-hoch' };
    if (sv < -2 && si > sv + 2) return { von, bis, lage, tipp: 'ende-runter' };
  }
  return { von, bis, lage, tipp: flach ? 'mehr-melodie' : 'stelle' };
}
