import { TONE_KEYS, type Tone } from '@/constants/tones';
import { KALIBRIER_SATZ_VERSION, KALIBRIER_WOERTER, type KalibrierWort } from '@/data/tone-calibration-words';

/**
 * Bericht des Thai-Kalibrierlaufs und Stimm-Referenz (24.10.2026).
 *
 * Rein und ohne Audio: Der Helper (`scripts/content/tone-calibration.cjs`)
 * dekodiert die Clips, misst sie mit `analyzeToneContour` und dem Ton-Gate
 * und gibt hier nur Zahlen herein. So lässt sich der Bericht mit Testdaten
 * prüfen.
 */

export type KalibrierStatus = 'passed' | 'failed' | 'unchecked' | 'fehlt';

export type KalibrierMessung = {
  wortId: string;
  /** Ergebnis des Ton-Gates; `fehlt` = kein Clip oder nicht dekodierbar. */
  status: KalibrierStatus;
  grund?: string;
  /** Median der bewerteten Tonhöhenstrecke dieses Clips (Hz). */
  referenzHz?: number;
  /** Sechs Punkte (0–100 %) in Halbtönen zur Clip-Referenz. */
  pts?: number[];
  /** Tonhöhe (Hz) aller Fenster der bewerteten Strecke. */
  spanHz?: number[];
  /** Formurteil je Silbe aus dem Gate (Mehrsilber). */
  silben?: { tone: Tone; form: string }[];
};

export type StimmLauf = {
  stimme: string;
  model?: string;
  instructionsId?: string;
  messungen: KalibrierMessung[];
};

type Zaehler = { n: number; bestanden: number; verworfen: number; ungeprueft: number; fehlt: number };

export type Stimmlage = { medianHz: number; p10Hz: number; p90Hz: number; spannweiteHalbtoene: number };

export type StimmBericht = {
  stimme: string;
  model?: string;
  instructionsId?: string;
  gesamt: Zaehler;
  /** Nur Einsilber: dort ist der Ton eindeutig einem Wort zugeordnet. */
  jeTon: Record<Tone, Zaehler>;
  mehrsilber: Zaehler;
  stimmlage: Stimmlage | null;
  /**
   * Trennschärfe wie im Tonbericht (0,5 = Zufall, 1 = sauber): endet ein
   * tiefes Wort tiefer als ein mittleres? Hat fallend den Bauch, mittel nicht?
   */
  trennung: { tiefUnterMittel: number | null; fallendGegenMittel: number | null };
  /** (bestanden − 2 × verworfen) / Wörter — ein Verwurf kostet einen neuen Clip. */
  punkte: number;
  geeignet: boolean;
  hinweise: string[];
};

export type KalibrierBericht = {
  satzVersion: string;
  toneGateVersion?: string;
  erstelltAm: string;
  stimmen: StimmBericht[];
  empfehlung: { stimme: string | null; text: string };
};

/** Ab diesem Verwurfanteil ist eine Stimme für den großen Lauf ungeeignet. */
export const MAX_VERWURF_ANTEIL = 0.15;
/** Ab diesem Anteil fehlender Clips ist der Lauf nicht aussagekräftig. */
export const MAX_FEHLT_ANTEIL = 0.2;

const leer = (): Zaehler => ({ n: 0, bestanden: 0, verworfen: 0, ungeprueft: 0, fehlt: 0 });

function zaehle(z: Zaehler, status: KalibrierStatus) {
  z.n += 1;
  if (status === 'passed') z.bestanden += 1;
  else if (status === 'failed') z.verworfen += 1;
  else if (status === 'unchecked') z.ungeprueft += 1;
  else z.fehlt += 1;
}

const median = (werte: readonly number[]): number | null => {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(s.length / 2);
  return s.length % 2 ? s[mitte] : (s[mitte - 1] + s[mitte]) / 2;
};

function quantil(werte: readonly number[], q: number): number {
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

function trennschaerfe(kleiner: readonly number[], groesser: readonly number[]): number | null {
  if (!kleiner.length || !groesser.length) return null;
  let summe = 0;
  for (const a of kleiner) for (const b of groesser) summe += a < b ? 1 : a === b ? 0.5 : 0;
  return summe / (kleiner.length * groesser.length);
}

const halbtoene = (hz: number, bezugHz: number) => 12 * Math.log2(hz / bezugHz);
const runde = (wert: number, stellen = 2) => Math.round(wert * 10 ** stellen) / 10 ** stellen;

/** Stimmlage aus allen gemessenen Fenstern aller Clips einer Stimme. */
export function stimmlageAus(messungen: readonly KalibrierMessung[]): Stimmlage | null {
  const hz = messungen.flatMap((m) => (m.status === 'fehlt' ? [] : m.spanHz ?? [])).filter((f) => f > 0);
  if (hz.length < 10) return null;
  const medianHz = median(hz)!;
  const p10Hz = quantil(hz, 0.1);
  const p90Hz = quantil(hz, 0.9);
  return { medianHz: runde(medianHz, 1), p10Hz: runde(p10Hz, 1), p90Hz: runde(p90Hz, 1), spannweiteHalbtoene: runde(halbtoene(p90Hz, p10Hz), 1) };
}

/** Sechs Punkte einer Messung in Halbtönen zum Stimm-Median. */
function konturZurStimme(messung: KalibrierMessung, medianHz: number): number[] | null {
  if (!messung.pts || messung.pts.length !== 6 || !messung.referenzHz) return null;
  const verschiebung = halbtoene(messung.referenzHz, medianHz);
  return messung.pts.map((p) => p + verschiebung);
}

function woerterNachId(): Map<string, KalibrierWort> {
  return new Map(KALIBRIER_WOERTER.map((wort) => [wort.id, wort]));
}

export function stimmBericht(lauf: StimmLauf): StimmBericht {
  const woerter = woerterNachId();
  const nachId = new Map(lauf.messungen.map((m) => [m.wortId, m]));
  const gesamt = leer();
  const mehrsilber = leer();
  const jeTon = Object.fromEntries(TONE_KEYS.map((ton) => [ton, leer()])) as Record<Tone, Zaehler>;
  // Jedes Wort des Satzes zählt — ein fehlender Clip ist „fehlt“, nicht weg.
  const alle: { wort: KalibrierWort; messung: KalibrierMessung }[] = KALIBRIER_WOERTER.map((wort) => ({
    wort, messung: nachId.get(wort.id) ?? { wortId: wort.id, status: 'fehlt', grund: 'Kein Clip.' },
  }));
  for (const { wort, messung } of alle) {
    zaehle(gesamt, messung.status);
    if (wort.toene.length === 1) zaehle(jeTon[wort.toene[0]], messung.status);
    else zaehle(mehrsilber, messung.status);
  }

  const stimmlage = stimmlageAus(alle.map((a) => a.messung));
  const lebendeEinsilber = (ton: Tone) => alle.filter(({ wort, messung }) =>
    wort.toene.length === 1 && wort.toene[0] === ton && wort.silbe?.lebend && messung.status !== 'fehlt');
  const enden = (ton: Tone) => stimmlage
    ? lebendeEinsilber(ton).map(({ messung }) => konturZurStimme(messung, stimmlage.medianHz)?.[5]).filter((v): v is number => v !== undefined)
    : [];
  const baeuche = (ton: Tone) => lebendeEinsilber(ton)
    .map(({ messung }) => messung.pts?.length === 6 ? (messung.pts[0] + messung.pts[5]) / 2 - (messung.pts[2] + messung.pts[3]) / 2 : undefined)
    .filter((v): v is number => v !== undefined);
  const tiefUnterMittel = trennschaerfe(enden('low'), enden('mid'));
  const fallendGegenMittel = trennschaerfe(baeuche('falling'), baeuche('mid'));

  const verwurfAnteil = gesamt.n ? gesamt.verworfen / gesamt.n : 0;
  const fehltAnteil = gesamt.n ? gesamt.fehlt / gesamt.n : 1;
  const hinweise: string[] = [];
  if (fehltAnteil > MAX_FEHLT_ANTEIL) hinweise.push(`${gesamt.fehlt} von ${gesamt.n} Clips fehlen oder sind nicht dekodierbar — Lauf wiederholen.`);
  if (verwurfAnteil >= MAX_VERWURF_ANTEIL) hinweise.push(`Verwirft ${Math.round(100 * verwurfAnteil)} % — im großen Lauf droht der Ton-Notstopp, jeder Verwurf kostet einen neuen Clip.`);
  const schwach = TONE_KEYS.filter((ton) => jeTon[ton].n && jeTon[ton].verworfen / jeTon[ton].n >= 0.3);
  if (schwach.length) hinweise.push(`Schwach bei: ${schwach.join(', ')} (≥ 30 % verworfen).`);
  if (tiefUnterMittel !== null && tiefUnterMittel < 0.6) hinweise.push('Tief und mittel enden kaum unterscheidbar hoch.');
  if (fallendGegenMittel !== null && fallendGegenMittel < 0.6) hinweise.push('Fallend hebt sich in der Form kaum von mittel ab.');

  return {
    stimme: lauf.stimme,
    ...(lauf.model ? { model: lauf.model } : {}),
    ...(lauf.instructionsId ? { instructionsId: lauf.instructionsId } : {}),
    gesamt, jeTon, mehrsilber, stimmlage,
    trennung: {
      tiefUnterMittel: tiefUnterMittel === null ? null : runde(tiefUnterMittel),
      fallendGegenMittel: fallendGegenMittel === null ? null : runde(fallendGegenMittel),
    },
    punkte: gesamt.n ? runde((gesamt.bestanden - 2 * gesamt.verworfen) / gesamt.n, 3) : 0,
    geeignet: verwurfAnteil < MAX_VERWURF_ANTEIL && fehltAnteil <= MAX_FEHLT_ANTEIL,
    hinweise,
  };
}

const trennSumme = (bericht: StimmBericht) =>
  (bericht.trennung.tiefUnterMittel ?? 0.5) + (bericht.trennung.fallendGegenMittel ?? 0.5);

/** Reihenfolge: geeignet vor ungeeignet, dann Punkte, bei Gleichstand (< 0,02) die Trennschärfe. */
export function vergleicheStimmen(a: StimmBericht, b: StimmBericht): number {
  if (a.geeignet !== b.geeignet) return a.geeignet ? -1 : 1;
  if (Math.abs(a.punkte - b.punkte) >= 0.02) return b.punkte - a.punkte;
  return trennSumme(b) - trennSumme(a);
}

export function kalibrierBericht(laeufe: readonly StimmLauf[], optionen: { jetzt?: Date; toneGateVersion?: string } = {}): KalibrierBericht {
  const stimmen = laeufe.map(stimmBericht).sort(vergleicheStimmen);
  const beste = stimmen[0];
  const zahlen = (b: StimmBericht) =>
    `${b.gesamt.bestanden}/${b.gesamt.n} bestanden, ${b.gesamt.verworfen} verworfen, ${b.gesamt.ungeprueft} ungeprüft${b.gesamt.fehlt ? `, ${b.gesamt.fehlt} fehlen` : ''}`;
  let empfehlung: KalibrierBericht['empfehlung'];
  if (!beste) {
    empfehlung = { stimme: null, text: 'Noch keine Kalibrierclips vorhanden.' };
  } else if (!beste.geeignet) {
    empfehlung = {
      stimme: null,
      text: `Keine Stimme ist für den großen Lauf geeignet (beste: ${beste.stimme} — ${zahlen(beste)}). Erst Stimme oder Sprechanweisung ändern und neu kalibrieren.`,
    };
  } else {
    const allein = stimmen.length === 1 ? ' Nur diese Stimme wurde gemessen.' : '';
    empfehlung = { stimme: beste.stimme, text: `Empfehlung für den großen Lauf: ${beste.stimme} — ${zahlen(beste)}.${allein}` };
  }
  return {
    satzVersion: KALIBRIER_SATZ_VERSION,
    ...(optionen.toneGateVersion ? { toneGateVersion: optionen.toneGateVersion } : {}),
    erstelltAm: (optionen.jetzt ?? new Date()).toISOString(),
    stimmen,
    empfehlung,
  };
}

// ---------------------------------------------------------------------------
// Stimm-Referenz für das Ton-Gate
// ---------------------------------------------------------------------------

export const STIMM_REFERENZ_FORMAT = 'thaispeaker-stimmreferenz-1';

export type TonLage = {
  /** Zahl der Einsilber, aus denen die Lage stammt. */
  n: number;
  /** Median je Punkt (0/20/40/60/80/100 %), Halbtöne zum Stimm-Median. */
  kontur: number[];
  anfang: number;
  ende: number;
  mittel: number;
};

export type StimmReferenz = {
  format: typeof STIMM_REFERENZ_FORMAT;
  provider: string;
  model?: string;
  voice: string;
  instructionsId?: string;
  satzVersion: string;
  toneGateVersion?: string;
  gemessenAm: string;
  /** Clips, deren Tonhöhe in die Stimmlage einging. */
  clips: number;
  medianHz: number;
  p10Hz: number;
  p90Hz: number;
  spannweiteHalbtoene: number;
  /** Lage je Ton aus bestandenen und ungeprüften Einsilbern; `null` ohne Daten. */
  toene: Record<Tone, TonLage | null>;
};

/**
 * Die Stimm-Referenz eines Laufs — `null`, wenn zu wenig gemessen wurde.
 * Verworfene Clips bleiben draußen: Sie zeigen gerade nicht, wie der Ton
 * bei dieser Stimme klingen soll.
 */
export function stimmReferenz(
  lauf: StimmLauf,
  optionen: { provider?: string; jetzt?: Date; toneGateVersion?: string } = {}
): StimmReferenz | null {
  const stimmlage = stimmlageAus(lauf.messungen);
  if (!stimmlage) return null;
  const woerter = woerterNachId();
  const toene = Object.fromEntries(TONE_KEYS.map((ton) => {
    const konturen = lauf.messungen
      .filter((m) => (m.status === 'passed' || m.status === 'unchecked') && woerter.get(m.wortId)?.toene.join() === ton)
      .map((m) => konturZurStimme(m, stimmlage.medianHz))
      .filter((k): k is number[] => k !== null);
    if (!konturen.length) return [ton, null];
    const kontur = [0, 1, 2, 3, 4, 5].map((i) => runde(median(konturen.map((k) => k[i]))!));
    const mittel = runde(median(konturen.map((k) => k.reduce((s, v) => s + v, 0) / k.length))!);
    return [ton, { n: konturen.length, kontur, anfang: kontur[0], ende: kontur[5], mittel }];
  })) as Record<Tone, TonLage | null>;
  return {
    format: STIMM_REFERENZ_FORMAT,
    provider: optionen.provider ?? 'gemini',
    ...(lauf.model ? { model: lauf.model } : {}),
    voice: lauf.stimme,
    ...(lauf.instructionsId ? { instructionsId: lauf.instructionsId } : {}),
    satzVersion: KALIBRIER_SATZ_VERSION,
    ...(optionen.toneGateVersion ? { toneGateVersion: optionen.toneGateVersion } : {}),
    gemessenAm: (optionen.jetzt ?? new Date()).toISOString(),
    clips: lauf.messungen.filter((m) => m.status !== 'fehlt' && (m.spanHz?.length ?? 0) > 0).length,
    ...stimmlage,
    toene,
  };
}
