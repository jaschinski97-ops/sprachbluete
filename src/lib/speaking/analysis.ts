/**
 * Lokale F0-Konturmessung fuer die Sprechuebung.
 *
 * Urspruenglich aus dem Messwerkzeug (Phase 11, AE-31) uebertragen;
 * `scripts/tone-contour.html` verwendet jetzt diesen gemeinsamen Kern.
 * 40-ms-Fenster, 10-ms-Schritt,
 * normierte Autokorrelation von 70 bis 400 Hz, Energie- und
 * Korrelationsschwelle, stetiger Kandidatenpfad (Viterbi), Medianfilter (3),
 * laengste stimmhafte Strecke,
 * einmalige grobe Oktavkorrektur und 8 % Beschnitt an beiden Raendern.
 * Ohne sichere Vier-Fenster-Strecke erlaubt AE-58 eine eng begrenzte
 * Fortsetzung schwacher Periodizitaet; vorhandene sichere Strecken bleiben.
 *
 * Dieses Modul kennt weder Aufnahme-APIs noch TTS oder Netzwerkzugriffe. Es
 * bekommt ausschliesslich Mono-PCM und liefert Messwerte zurueck.
 */

import { Tone } from '@/constants/tones';

export const F0_WINDOW_SECONDS = 0.04;
export const F0_HOP_SECONDS = 0.01;
export const F0_MIN_HZ = 70;
export const F0_MAX_HZ = 400;
export const F0_MIN_CORRELATION = 0.6;
/** Weak frames may CONTINUE a confidently voiced track, never seed one. */
export const F0_CONTINUATION_CORRELATION = 0.18;
export const F0_MAX_STEP_SEMITONES = 2;
export const F0_MIN_RELATIVE_RMS = 0.08;
export const OCTAVE_RATIO = 1.8;
/**
 * Stetiger Tonhöhenpfad (17.10.2026): Je stimmhaftem Fenster zählen alle
 * lokalen Korrelationsmaxima ab dieser Stärke als Kandidat, ein Viterbi-Pfad
 * wählt die Folge mit hoher Korrelation UND kleinen Sprüngen (Verfahren wie
 * Praats „To Pitch (ac)“: Oktavkosten und Oktavsprungkosten).
 *
 * WARUM: Bei einer periodischen Stimme korreliert auch die doppelte Periode
 * fast perfekt. Das bisher genommene globale Maximum lag oft dort, und die
 * Kurve sprang für einige Fenster auf die halbe Frequenz (มา: 211 → 107 →
 * 216 Hz). An 400 Thai-Clips des Bestands: 262 Clips mit solchen Sprüngen,
 * 1.172 insgesamt; mit dem Pfad 15 Clips, 16 Sprünge. Die Clip-Mediane
 * blieben gleich (coral 186 Hz, onyx 89 Hz). Die bloße Wahl der kürzesten
 * Periode (YIN-artig) wurde verworfen: Sie sprang am tiefen Ende fallender
 * Töne nach OBEN und hätte 33 korrekt gesprochene Clips verworfen.
 */
export const F0_CANDIDATE_CORRELATION = 0.45;
export const F0_MAX_CANDIDATES = 6;
/** Kosten je Oktave Sprung zwischen zwei Fenstern (Praat-Vorgabe 0,35). */
export const F0_OCTAVE_JUMP_COST = 0.35;
/** Leichte Bevorzugung höherer Kandidaten je Oktave (Praat-Vorgabe 0,01). */
export const F0_OCTAVE_COST = 0.01;
export const CONTOUR_EDGE_TRIM = 0.08;
/**
 * Obergrenze nur fuer die Vorverarbeitung der App-Aufnahmen.
 *
 * Bei 48 kHz kostet die unveraenderte Autokorrelation pro Sekunde ueber
 * hundert Millionen innere Schleifendurchlaeufe. 8 kHz bildet den
 * ausgewerteten Bereich bis 400 Hz weiterhin deutlich ueber Nyquist ab und
 * senkt die Arbeit auf ungefaehr ein Sechsunddreissigstel.
 */
export const MAX_F0_ANALYSIS_SAMPLE_RATE = 8_000;

export type F0Frame = {
  /** Startzeit des Fensters in Sekunden. */
  t: number;
  /** Startindex des Fensters im PCM-Puffer. */
  start: number;
  rms: number;
  /** Grundfrequenz in Hz; 0 bedeutet: in diesem Fenster nicht stimmhaft. */
  f0: number;
  /** Best normalized correlation, retained even when the frame is rejected. */
  correlation?: number;
};

export type SixPointContour = [number, number, number, number, number, number];

export type ToneContourSummary = {
  /** Halbtoene bei 0/20/40/60/80/100 % der bewerteten Strecke. */
  pts: SixPointContour;
  start: number;
  end: number;
  min: number;
  max: number;
  mean: number;
  /** Ende minus Anfang, in Halbtoenen. */
  slope: number;
  /** Abstand zwischen erstem und letztem Fensterstart. */
  durMs: number;
};

export type MeasuredToneContour = {
  status: 'measured';
  inputSampleRate: number;
  /** Abtastrate nach lokaler Vorverarbeitung, hoechstens 8 kHz. */
  analysisSampleRate: number;
  /** Alle Fenster vor Auswahl der stimmhaften Strecke. */
  frames: F0Frame[];
  /** Laengste Strecke nach Oktavkorrektur und Randbeschnitt. */
  span: F0Frame[];
  voicedMs: number;
  referenceHz: number;
  /**
   * Eine einzelne Aufnahme liefert nur ihren eigenen Median. Eine
   * `speaker-baseline` muss aus mehreren lokalen Aufnahmen stammen.
   */
  referenceKind: 'attempt-median' | 'speaker-baseline';
  summary: ToneContourSummary;
};

export type UnmeasurableToneContour = {
  status: 'unmeasurable';
  reason: 'no-voiced-run';
  inputSampleRate: number;
  analysisSampleRate: number;
  frames: F0Frame[];
  voicedMs: number;
};

export type ToneContourMeasurement = MeasuredToneContour | UnmeasurableToneContour;

export type PreparedPcm = {
  samples: Float32Array;
  sampleRate: number;
  downsampleFactor: number;
};

/**
 * Senkt nur die Abtastrate vor dem unveraenderten F0-Kern.
 *
 * Es wird ein ganzzahliger Faktor gewaehlt und jeder Block gemittelt. Dadurch
 * bleibt die Dauer erhalten, ein 48-kHz-Puffer wird exakt zu 8 kHz, und
 * 44,1 kHz wird zu 7,35 kHz. Das Blockmittel wirkt zugleich als einfacher
 * Tiefpass gegen Aliasanteile. PCM mit bereits hoechstens 8 kHz bleibt bis
 * auf die notwendige Float32-Kopie unveraendert.
 */
export function downsampleForF0(
  samples: ArrayLike<number>,
  sampleRate: number,
  maxSampleRate: number = MAX_F0_ANALYSIS_SAMPLE_RATE
): PreparedPcm {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate muss eine positive Zahl sein.');
  }
  if (!Number.isFinite(maxSampleRate) || maxSampleRate <= 0) {
    throw new RangeError('maxSampleRate muss eine positive Zahl sein.');
  }

  const downsampleFactor = Math.max(1, Math.ceil(sampleRate / maxSampleRate));
  const length = Math.floor(samples.length / downsampleFactor);
  const prepared = new Float32Array(length);

  for (let output = 0; output < length; output++) {
    let sum = 0;
    const start = output * downsampleFactor;
    for (let offset = 0; offset < downsampleFactor; offset++) {
      sum += samples[start + offset];
    }
    prepared[output] = sum / downsampleFactor;
  }

  return {
    samples: prepared,
    sampleRate: sampleRate / downsampleFactor,
    downsampleFactor,
  };
}

/**
 * F0 je Fenster ueber normierte Autokorrelation.
 *
 * Wie im Messwerkzeug wird vor der Korrelation zuerst das maximale RMS ueber
 * alle Fenster bestimmt. Der Medianfilter liest aus einer unveraenderten
 * Kopie der urspruenglichen F0-Werte, damit ein ersetzter Nachbar nicht die
 * naechste Ersetzung beeinflusst.
 */
export function autocorrF0(samples: ArrayLike<number>, sampleRate: number, recoverWeakVoicing = true): F0Frame[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate muss eine positive Zahl sein.');
  }

  const win = Math.round(F0_WINDOW_SECONDS * sampleRate);
  const hop = Math.round(F0_HOP_SECONDS * sampleRate);
  const minLag = Math.floor(sampleRate / F0_MAX_HZ);
  const maxLag = Math.ceil(sampleRate / F0_MIN_HZ);
  const frames: F0Frame[] = [];
  let maxRms = 0;

  for (let start = 0; start + win + maxLag <= samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) {
      energy += samples[start + i] * samples[start + i];
    }
    const rms = Math.sqrt(energy / win);
    maxRms = Math.max(maxRms, rms);
    frames.push({ t: start / sampleRate, start, rms, f0: 0 });
  }

  const candidates = new Map<F0Frame, number>();
  const pitchCandidates = new Map<F0Frame, PitchCandidate[]>();
  const correlations = new Float64Array(maxLag + 2);
  for (const frame of frames) {
    if (frame.rms < F0_MIN_RELATIVE_RMS * maxRms) continue;

    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let numerator = 0;
      let d1 = 0;
      let d2 = 0;
      for (let i = 0; i < win; i++) {
        const a = samples[frame.start + i];
        const b = samples[frame.start + i + lag];
        numerator += a * b;
        d1 += a * a;
        d2 += b * b;
      }
      const correlation = numerator / (Math.sqrt(d1 * d2) || 1);
      correlations[lag] = correlation;
      if (correlation > best) {
        best = correlation;
        bestLag = lag;
      }
    }
    frame.correlation = best;
    if (best >= F0_CONTINUATION_CORRELATION) candidates.set(frame, sampleRate / bestLag);
    if (best >= F0_MIN_CORRELATION) {
      frame.f0 = sampleRate / bestLag;
      const own: PitchCandidate[] = [];
      for (let lag = minLag + 1; lag < maxLag; lag++) {
        const r = correlations[lag];
        if (r >= F0_CANDIDATE_CORRELATION && r >= correlations[lag - 1] && r >= correlations[lag + 1]) {
          own.push({ hz: sampleRate / lag, correlation: r });
        }
      }
      if (!own.some((candidate) => candidate.hz === frame.f0)) own.push({ hz: frame.f0, correlation: best });
      own.sort((a, b) => b.correlation - a.correlation);
      pitchCandidates.set(frame, own.slice(0, F0_MAX_CANDIDATES));
    }
  }
  stetigerPfad(frames, pitchCandidates);

  // Short dead syllables can lose periodicity while their F0 falls smoothly.
  // Hysteresis preserves that continuation without accepting a whole low-r
  // noise track. No gaps, octave jumps, or isolated weak runs are bridged.
  // A valid strict run wins. Extending every run polluted Niwat's otherwise
  // measurable contours in the AE-31 reproduction; recovery is a fallback
  // only for recordings that would otherwise have no four-frame run at all.
  if (recoverWeakVoicing && !longestRun(frames)) {
    for (const direction of [1, -1]) {
      for (let i = direction === 1 ? 1 : frames.length - 2;
        i >= 0 && i < frames.length; i += direction) {
        const frame = frames[i];
        const previous = frames[i - direction];
        const candidate = candidates.get(frame);
        if (!frame.f0 && previous?.f0 && candidate &&
          Math.abs(semitones(candidate, previous.f0)) <= F0_MAX_STEP_SEMITONES) {
          frame.f0 = candidate;
        }
      }
    }
  }

  const originalF0 = frames.map((frame) => frame.f0);
  for (let i = 1; i < frames.length - 1; i++) {
    const trio = [originalF0[i - 1], originalF0[i], originalF0[i + 1]]
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (trio.length === 3) frames[i].f0 = trio[1];
  }

  return frames;
}

type PitchCandidate = { hz: number; correlation: number };

/**
 * Viterbi je stimmhaftem Zug: maximiert die Summe aus Kandidatenstärke und
 * zieht je Fensterschritt die Sprungkosten ab. Ein sanfter Fall (fallender
 * Ton, 10 Halbtöne über 200 ms) kostet je Schritt fast nichts, ein
 * Oktavsprung 0,35 — mehr, als ein Kandidat an Korrelation gewinnen kann.
 */
function stetigerPfad(frames: F0Frame[], pitchCandidates: ReadonlyMap<F0Frame, PitchCandidate[]>): void {
  const staerke = (candidate: PitchCandidate) => candidate.correlation + F0_OCTAVE_COST * Math.log2(candidate.hz / F0_MIN_HZ);
  let i = 0;
  while (i < frames.length) {
    if (!frames[i].f0) {
      i++;
      continue;
    }
    let j = i;
    while (j < frames.length && frames[j].f0) j++;
    const zug = frames.slice(i, j).map((frame) => pitchCandidates.get(frame) ?? [{ hz: frame.f0, correlation: frame.correlation ?? 0 }]);
    let score = zug[0].map(staerke);
    const zurueck: number[][] = [];
    for (let t = 1; t < zug.length; t++) {
      const next: number[] = [];
      const back: number[] = [];
      for (const candidate of zug[t]) {
        let bestScore = Number.NEGATIVE_INFINITY;
        let bestIndex = 0;
        zug[t - 1].forEach((previous, index) => {
          const value = score[index] - F0_OCTAVE_JUMP_COST * Math.abs(Math.log2(candidate.hz / previous.hz));
          if (value > bestScore) {
            bestScore = value;
            bestIndex = index;
          }
        });
        next.push(bestScore + staerke(candidate));
        back.push(bestIndex);
      }
      score = next;
      zurueck.push(back);
    }
    let k = score.indexOf(Math.max(...score));
    for (let t = zug.length - 1; t >= 0; t--) {
      frames[i + t].f0 = zug[t][k].hz;
      if (t > 0) k = zurueck[t - 1][k];
    }
    i = j;
  }
}

/**
 * Alle zusammenhaengenden stimmhaften Strecken, jede mindestens `minFrames` lang.
 *
 * Gegenstueck zu `longestRun` fuer mehrsilbige Clips: Thai-Silben sind im
 * F0-Track oft eigene Zuege, weil stimmlose Plosive und Aspirate die
 * Periodizitaet unterbrechen. Die Reihenfolge folgt der Zeit — Silbe i der
 * Schrift gehoert zum i-ten Zug, solange die Zahl der Zuege zur Zahl der
 * Soll-Silben passt (Zuordnung ausserhalb des Tor-Moduls, AE-7/AE-8 bleiben
 * fail-closed: bei keiner uebereinstimmenden Zahl wird nichts geraten).
 */
export function voicedRuns(frames: readonly F0Frame[], minFrames = 4): F0Frame[][] {
  const runs: F0Frame[][] = [];
  let current: F0Frame[] = [];

  for (const frame of frames) {
    if (frame.f0 > 0) {
      current.push(frame);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);

  return runs.filter((run) => run.length >= minFrames);
}

/** Laengste zusammenhaengende stimmhafte Strecke, mindestens vier Fenster. */
export function longestRun(frames: readonly F0Frame[]): F0Frame[] | null {
  const runs: F0Frame[][] = [];
  let current: F0Frame[] = [];

  for (const frame of frames) {
    if (frame.f0 > 0) {
      current.push(frame);
    } else {
      if (current.length) runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);

  runs.sort((a, b) => b.length - a.length);
  return runs[0] && runs[0].length >= 4 ? runs[0] : null;
}

/** Ab diesem Abstand zum Nachbarfenster (10 ms) ist ein Wert ein Sprung, kein Tonverlauf. */
export const OCTAVE_JUMP_SEMITONES = 5;

/**
 * Grobe Oktavkorrektur aus AE-31, bewusst nur ein Durchgang.
 *
 * Werte ueber Median * 1,8 werden einmal halbiert, Werte unter Median / 1,8
 * einmal verdoppelt — SEIT 17.10.2026 nur noch, wenn der Wert auch gegen
 * sein Nachbarfenster SPRINGT. Ein echter fallender Ton faellt im Bestand
 * um bis zu 12 Halbtoene (กลั้น 242 → 121 Hz); sein tiefes Ende lag unter
 * Median / 1,8 und wurde hochgeklappt, der Fall verschwand. Die Eingabe
 * wird nicht veraendert.
 */
export function octaveCorrect(run: readonly F0Frame[]): F0Frame[] {
  if (run.length === 0) return [];
  const sorted = run.map((frame) => frame.f0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const springt = (i: number) => {
    const nachbar = run[i - 1] ?? run[i + 1];
    return !nachbar || Math.abs(semitones(run[i].f0, nachbar.f0)) > OCTAVE_JUMP_SEMITONES;
  };

  return run.map((frame, i) => {
    let f0 = frame.f0;
    if (f0 > median * OCTAVE_RATIO && springt(i)) f0 /= 2;
    else if (f0 < median / OCTAVE_RATIO && springt(i)) f0 *= 2;
    return { ...frame, f0 };
  });
}

/** Entfernt den angegebenen Anteil an Anfang und Ende, sofern vier Fenster bleiben. */
export function trimEdges(
  run: readonly F0Frame[],
  fraction: number = CONTOUR_EDGE_TRIM
): F0Frame[] {
  const cut = Math.floor(run.length * fraction);
  return run.length - 2 * cut >= 4 ? run.slice(cut, run.length - cut) : [...run];
}

/** Tonhoehenabstand in Halbtoenen relativ zu `referenceHz`. */
export function semitones(hz: number, referenceHz: number): number {
  return 12 * Math.log2(hz / referenceHz);
}

/** Derselbe obere Median, den das HTML-Werkzeug fuer seine Referenz benutzt. */
export function medianReferenceHz(span: readonly F0Frame[]): number {
  if (span.length === 0) throw new Error('Keine F0-Werte fuer eine Referenz vorhanden.');
  const sorted = span.map((frame) => frame.f0).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Sechs Stuetzstellen und Kenngroessen wie in `scripts/tone-contour.html`. */
export function summarizeContour(
  span: readonly F0Frame[],
  referenceHz: number
): ToneContourSummary {
  if (span.length === 0) throw new Error('Eine leere Strecke hat keine Tonkontur.');
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) {
    throw new RangeError('referenceHz muss eine positive Zahl sein.');
  }

  const n = span.length;
  const at = (position: number) =>
    semitones(span[Math.min(n - 1, Math.round(position * (n - 1)))].f0, referenceHz);
  const pts = [0, 0.2, 0.4, 0.6, 0.8, 1].map(at) as SixPointContour;
  const all = span.map((frame) => semitones(frame.f0, referenceHz));
  const mean = all.reduce((sum, value) => sum + value, 0) / n;

  return {
    pts,
    start: pts[0],
    end: pts[5],
    min: Math.min(...all),
    max: Math.max(...all),
    mean,
    slope: pts[5] - pts[0],
    durMs: Math.round((span[n - 1].t - span[0].t) * 1000),
  };
}

/**
 * Die zwei BEWEGUNGEN einer Kontur: der Abfall nach dem Gipfel und der
 * Anstieg nach dem Tal, jeweils mit der Lage des Wendepunkts.
 *
 * WARUM NICHT `slope` (Ende minus Anfang), 20.09.: Der thailaendische
 * FALLENDE Ton wird regelmaessig als Steig-Fall gesprochen — die Silbe setzt
 * tief an, steigt kurz und faellt dann. Gemessen an den echten Clips des
 * Laufs (เจ้าสาว coral: Gipfel bei 40 %, Abfall 4,1 Halbtoene, `slope` aber
 * nur −1,65) verfehlt eine reine Anfang-Ende-Steigung genau diese korrekt
 * gesprochenen Silben. Derselbe Effekt spiegelbildlich beim steigenden Ton,
 * wenn die Aeusserung am Ende absackt. Gipfel- und talbezogen gemessen
 * bleiben Fall und Anstieg sichtbar, und die LAGE des Wendepunkts trennt
 * fallend (frueher Gipfel) sauber von steigend (spaeter Gipfel).
 *
 * Bewusst nur beschreibend: welche Schwellen gelten, entscheidet der
 * Aufrufer (das Tontor). `matchesTone`/`matchesToneShape` bleiben dafuer
 * unveraendert — sie geben der Sprechuebung ihr an isolierten Silben
 * kalibriertes Urteil.
 */
export type Konturbewegung = {
  /** Groesster Abfall NACH dem Gipfel, in Halbtoenen; 0 = kein Abfall. */
  fall: number;
  /** Lage des Gipfels auf der Strecke: 0 = Anfang, 1 = Ende. */
  gipfelBei: number;
  /** Groesster Anstieg NACH dem Tal, in Halbtoenen; 0 = kein Anstieg. */
  stieg: number;
  /** Lage des Tals auf der Strecke: 0 = Anfang, 1 = Ende. */
  talBei: number;
};

export function konturBewegung(summary: ToneContourSummary): Konturbewegung {
  const pts = summary.pts;
  const letzte = pts.length - 1;
  let gipfel = 0;
  let tal = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i] > pts[gipfel]) gipfel = i;
    if (pts[i] < pts[tal]) tal = i;
  }
  const nachGipfel = pts.slice(gipfel + 1);
  const nachTal = pts.slice(tal + 1);
  return {
    fall: nachGipfel.length ? pts[gipfel] - Math.min(...nachGipfel) : 0,
    gipfelBei: gipfel / letzte,
    stieg: nachTal.length ? Math.max(...nachTal) - pts[tal] : 0,
    talBei: tal / letzte,
  };
}

/**
 * Passt die gemessene Kontur qualitativ zum erwarteten Ton?
 *
 * Die Schwellen sind unveraendert aus dem Messwerkzeug uebernommen. Das ist
 * eine Heuristik und ausdruecklich kein Urteil ueber die gesamte Aussprache.
 */
export function matchesTone(tone: Tone, summary: ToneContourSummary): boolean {
  switch (tone) {
    case 'mid':
      return Math.abs(summary.slope) < 3 && Math.abs(summary.mean) < 2.5;
    case 'low':
      return summary.mean < -0.5 && summary.slope < 1.5;
    case 'falling':
      return summary.slope < -3 && summary.max > summary.end + 3;
    case 'high':
      return summary.end > 0 && summary.end >= summary.start - 1;
    case 'rising':
      return summary.end - summary.min > 3 && summary.end > summary.start - 0.5;
  }
}

/**
 * Formanteil derselben Heuristik, ohne Aussagen ueber absolute Sprechlage.
 *
 * Bei der Referenz einer einzelnen Aufnahme liegt deren eigener Median per
 * Definition nahe null Halbtönen. Dann sind mittel, tief und hoch nicht
 * belastbar unterscheidbar: dieselbe ebene Form koennte alle drei Register
 * repraesentieren. Fuer diese Toene liefert die Funktion deshalb `null`
 * statt eines scheinbar objektiven Urteils. Nur die rein relativen Fall- und
 * Steigbedingungen aus dem Messwerkzeug bleiben ohne Sprecherreferenz uebrig.
 */
export function matchesToneShape(tone: Tone, summary: ToneContourSummary): boolean | null {
  switch (tone) {
    case 'mid':
      return null;
    case 'low':
      return null;
    case 'falling':
      return summary.slope < -3 && summary.max > summary.end + 3;
    case 'high':
      return null;
    case 'rising':
      return summary.end - summary.min > 3 && summary.end > summary.start - 0.5;
  }
}

/**
 * Vollstaendige Messpipeline fuer einen Mono-PCM-Puffer.
 *
 * Das HTML bestimmt `referenceHz` aus allen Clips derselben Stimme. Fuer eine
 * einzelne lokale Aufnahme kann stattdessen der Median ihrer bewerteten
 * Strecke verwendet werden; dadurch bleibt die Konturform sichtbar, aber die
 * absolute Einordnung der Sprechlage ist nicht kalibriert. Aufrufer mit einer
 * persoenlichen Referenz koennen sie deshalb ausdruecklich uebergeben.
 */
export function analyzeToneContour(
  samples: ArrayLike<number>,
  sampleRate: number,
  referenceHz?: number,
  recoverWeakVoicing = true
): ToneContourMeasurement {
  const prepared = downsampleForF0(samples, sampleRate);
  const frames = autocorrF0(prepared.samples, prepared.sampleRate, recoverWeakVoicing);
  const voicedMs = frames.filter((frame) => frame.f0 > 0).length * 10;
  const run = longestRun(frames);

  if (!run) {
    return {
      status: 'unmeasurable',
      reason: 'no-voiced-run',
      inputSampleRate: sampleRate,
      analysisSampleRate: prepared.sampleRate,
      frames,
      voicedMs,
    };
  }

  const span = trimEdges(octaveCorrect(run), CONTOUR_EDGE_TRIM);
  const ref = referenceHz ?? medianReferenceHz(span);
  return {
    status: 'measured',
    inputSampleRate: sampleRate,
    analysisSampleRate: prepared.sampleRate,
    frames,
    span,
    voicedMs,
    referenceHz: ref,
    referenceKind: referenceHz === undefined ? 'attempt-median' : 'speaker-baseline',
    summary: summarizeContour(span, ref),
  };
}
