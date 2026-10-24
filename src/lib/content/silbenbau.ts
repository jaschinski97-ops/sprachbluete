/**
 * Silbenbau aus der Paiboon-Umschrift für die Ausrichtung im Ton-Gate
 * (24.10.2026, `f0-syllables-6`).
 *
 * Das Gate braucht Silbengrenzen im Audio. Die Umschrift sagt, WO eine
 * stimmlose Lücke zu erwarten ist: vor einem stimmlosen Anlaut (k, kh, g,
 * dt, th, bp, ph, ch, j, s, f, h …) und nach einem Verschlusslaut im Auslaut
 * (p, t, k). Am alten Korpus (3.258 Mehrsilber, coral/onyx) hatten 98 % der
 * Clips mindestens so viele stimmlose Lücken wie so vorhergesagt.
 * Sonorer Anlaut (m, n, ng, l, r, w, y) nach einer lebenden Silbe geht
 * dagegen oft OHNE Lücke über. Vokalanlaut und kurze offene Silben tragen
 * einen Kehlkopfverschluss, der manchmal eine Lücke zeigt.
 *
 * Nur Lesen, kein Urteil: unbekannte Zeichen ergeben `null`, und der
 * Aufrufer fällt dann auf die Ausrichtung ohne Silbenbau zurück.
 */

export type Silbenbau = {
  anlaut: 'stimmlos' | 'stimmhaft' | 'vokal';
  /** Langer Vokal oder Diphthong (aa, ii, ia, ua …). */
  lang: boolean;
  auslaut: 'verschluss' | 'sonor' | 'offen';
  /** Tote Silbe: Verschluss im Auslaut oder kurzer offener Vokal. */
  tot: boolean;
};

/** Wie eine Grenze zwischen zwei Silben im Audio aussehen sollte. */
export type GrenzArt = 'luecke' | 'vielleicht' | 'fliessend';

const VOKAL = /[aeiouəɛɔʉæɯɪ]/;
const STIMMLOS = /^(k|kh|g|t|th|dt|p|ph|bp|ch|j|s|f|h)(r|l|w)?$/;
const STIMMHAFT = /^(m|n|ng|l|r|w|y|b|d)(r|l)?$/;
/** Lange Vokale und Diphthonge der Umschrift. */
const LANG = /^(aa|ii|uu|ee|oo|ɛɛ|ɔɔ|əə|ʉʉ|ia|ua|ʉa)/;

function ohneTon(token: string): string {
  return token.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zəɛɔʉæɯɪ]/g, '');
}

/** Silbenbau eines Umschrift-Segments (z. B. „khâo“) oder null. */
export function silbenbau(token: string): Silbenbau | null {
  const p = ohneTon(token);
  const erster = p.search(VOKAL);
  if (erster < 0) return null;
  const onset = p.slice(0, erster);
  let ende = erster;
  while (ende < p.length && VOKAL.test(p[ende])) ende++;
  const vokal = p.slice(erster, ende);
  const coda = p.slice(ende);
  let anlaut: Silbenbau['anlaut'];
  if (!onset) anlaut = 'vokal';
  else if (STIMMLOS.test(onset)) anlaut = 'stimmlos';
  else if (STIMMHAFT.test(onset)) anlaut = 'stimmhaft';
  else return null;
  if (coda && !/^(p|t|k|m|n|ng)$/.test(coda)) return null;
  const lang = LANG.test(vokal);
  // Gleitlaut im Vokalteil (ai, ao, aai, ɔɔi …) ist ein sonorer Auslaut.
  const gleit = vokal.length >= 2 && /[iou]$/.test(vokal) && !LANG.test(vokal.slice(-2));
  const auslaut: Silbenbau['auslaut'] = /^[ptk]$/.test(coda) ? 'verschluss' : coda || gleit ? 'sonor' : 'offen';
  const tot = auslaut === 'verschluss' || (auslaut === 'offen' && !lang);
  return { anlaut, lang, auslaut, tot };
}

/** Silbenbau aller Segmente oder null, sobald eines unlesbar ist. */
export function silbenbauFolge(tokens: readonly string[]): Silbenbau[] | null {
  const folge: Silbenbau[] = [];
  for (const token of tokens) {
    const bau = silbenbau(token);
    if (!bau) return null;
    folge.push(bau);
  }
  return folge;
}

/** Erwartete Art der Grenze zwischen Silbe `vorne` und `hinten`. */
export function grenzArt(vorne: Silbenbau, hinten: Silbenbau): GrenzArt {
  if (vorne.auslaut === 'verschluss' || hinten.anlaut === 'stimmlos') return 'luecke';
  if (hinten.anlaut === 'vokal' || vorne.tot) return 'vielleicht';
  return 'fliessend';
}

/**
 * Erwartete relative Dauer des STIMMHAFTEN Teils einer Silbe: lange
 * lebende Silben tragen am meisten, kurze tote am wenigsten. Grobe
 * Gewichte; die Ausrichtung nutzt sie nur als weiche Vorgabe.
 */
export function erwarteteDauer(bau: Silbenbau, letzte: boolean): number {
  let dauer = bau.lang ? 1 : 0.6;
  if (bau.auslaut === 'sonor') dauer += 0.25;
  if (bau.auslaut === 'verschluss') dauer *= 0.8;
  if (bau.anlaut === 'stimmhaft') dauer += 0.15;
  return letzte ? dauer * 1.3 : dauer;
}
