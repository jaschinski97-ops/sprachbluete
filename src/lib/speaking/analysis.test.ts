import { Tone } from '@/constants/tones';

import {
  analyzeToneContour,
  autocorrF0,
  downsampleForF0,
  F0Frame,
  longestRun,
  matchesTone,
  matchesToneShape,
  octaveCorrect,
  semitones,
  summarizeContour,
  ToneContourSummary,
  trimEdges,
} from './analysis';

function frame(f0: number, index = 0): F0Frame {
  return { t: index * 0.01, start: index * 80, rms: f0 > 0 ? 0.5 : 0, f0 };
}

function sine(frequency: number, seconds: number, sampleRate: number): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) =>
    Math.sin((2 * Math.PI * frequency * index) / sampleRate)
  );
}

function sweptSine(
  startFrequency: number,
  endFrequency: number,
  seconds: number,
  sampleRate: number
): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let phase = 0;
  for (let index = 0; index < samples.length; index++) {
    const progress = index / Math.max(1, samples.length - 1);
    const frequency = startFrequency + (endFrequency - startFrequency) * progress;
    phase += (2 * Math.PI * frequency) / sampleRate;
    samples[index] = Math.sin(phase);
  }
  return samples;
}

describe('F0-Messkern aus scripts/tone-contour.html', () => {
  it('findet die Grundfrequenz eines sauberen 200-Hz-Signals', () => {
    const frames = autocorrF0(sine(200, 0.4, 8_000), 8_000);
    const voiced = frames.filter((candidate) => candidate.f0 > 0);

    expect(voiced.length).toBeGreaterThan(20);
    for (const candidate of voiced) expect(candidate.f0).toBeCloseTo(200, 5);
  });

  it('senkt 48 kHz vor der teuren Autokorrelation auf 8 kHz', () => {
    const input = sine(200, 0.4, 48_000);
    const prepared = downsampleForF0(input, 48_000);

    expect(prepared.sampleRate).toBe(8_000);
    expect(prepared.downsampleFactor).toBe(6);
    expect(prepared.samples).toHaveLength(input.length / 6);

    const result = analyzeToneContour(input, 48_000);
    expect(result.status).toBe('measured');
    if (result.status === 'measured') {
      expect(result.analysisSampleRate).toBe(8_000);
      expect(result.referenceKind).toBe('attempt-median');
      const medianF0 = [...result.span]
        .map((candidate) => candidate.f0)
        .sort((a, b) => a - b)[Math.floor(result.span.length / 2)];
      expect(medianF0).toBeCloseTo(200, 1);
    }
  });

  it('findet nur eine zusammenhängende Strecke mit mindestens vier Fenstern', () => {
    const frames = [
      frame(100, 0),
      frame(100, 1),
      frame(0, 2),
      frame(120, 3),
      frame(120, 4),
      frame(120, 5),
      frame(120, 6),
      frame(120, 7),
      frame(0, 8),
      frame(140, 9),
      frame(140, 10),
      frame(140, 11),
      frame(140, 12),
    ];

    expect(longestRun(frames)?.map((candidate) => candidate.f0)).toEqual([
      120, 120, 120, 120, 120,
    ]);
    expect(longestRun(frames.slice(0, 2))).toBeNull();
  });

  it('korrigiert den dokumentierten Oktavsprung mit der 1,8-fach-Regel', () => {
    const corrected = octaveCorrect([
      frame(200, 0),
      frame(100, 1),
      frame(100, 2),
      frame(100, 3),
      frame(50, 4),
    ]);

    expect(corrected.map((candidate) => candidate.f0)).toEqual([100, 100, 100, 100, 100]);
  });

  it('wendet die Oktavkorrektur nur einmal an', () => {
    const corrected = octaveCorrect([
      frame(400, 0),
      frame(100, 1),
      frame(100, 2),
      frame(100, 3),
      frame(100, 4),
    ]);

    // 400 liegt ueber 1,8 * 100 und wird halbiert. Auch wenn 200 danach noch
    // ueber 180 liegt, gibt es bewusst keinen zweiten Durchgang.
    expect(corrected[0].f0).toBe(200);
  });

  it('beschneidet an beiden Seiten exakt acht Prozent', () => {
    const run = Array.from({ length: 25 }, (_, index) => frame(100, index));
    const trimmed = trimEdges(run);

    expect(trimmed).toHaveLength(21);
    expect(trimmed[0].t).toBeCloseTo(0.02);
    expect(trimmed[trimmed.length - 1].t).toBeCloseTo(0.22);
    expect(run).toHaveLength(25);
  });

  it('rechnet Halbtoene und sechs Stuetzstellen wie das HTML', () => {
    expect(semitones(200, 100)).toBeCloseTo(12, 12);
    expect(semitones(50, 100)).toBeCloseTo(-12, 12);

    const summary = summarizeContour(
      [100, 200, 100, 50, 100, 200].map((f0, index) => frame(f0, index)),
      100
    );

    expect(summary.pts).toEqual([0, 12, 0, -12, 0, 12]);
    expect(summary.start).toBe(0);
    expect(summary.end).toBe(12);
    expect(summary.min).toBe(-12);
    expect(summary.max).toBe(12);
    expect(summary.mean).toBe(2);
    expect(summary.slope).toBe(12);
    expect(summary.durMs).toBe(50);
  });

  it('liefert bei Stille statt einer erfundenen Kontur unmeasurable', () => {
    const result = analyzeToneContour(new Float32Array(8_000), 8_000);
    expect(result.status).toBe('unmeasurable');
    if (result.status === 'unmeasurable') {
      expect(result.reason).toBe('no-voiced-run');
      expect(result.voicedMs).toBe(0);
      expect(result.analysisSampleRate).toBe(8_000);
    }
  });

  it('traegt eine steigende PCM-Kontur durch die komplette lokale Pipeline', () => {
    const result = analyzeToneContour(sweptSine(105, 190, 0.8, 16_000), 16_000);
    expect(result.status).toBe('measured');
    if (result.status === 'measured') {
      expect(result.referenceKind).toBe('attempt-median');
      expect(result.summary.end - result.summary.min).toBeGreaterThan(3);
      expect(matchesToneShape('rising', result.summary)).toBe(true);
      expect(matchesToneShape('falling', result.summary)).toBe(false);
    }
  });
});

describe('qualitative Formzuordnung aus scripts/tone-contour.html', () => {
  const base: ToneContourSummary = {
    pts: [0, 0, 0, 0, 0, 0],
    start: 0,
    end: 0,
    min: 0,
    max: 0,
    mean: 0,
    slope: 0,
    durMs: 300,
  };

  const compatible: Record<Tone, ToneContourSummary> = {
    mid: { ...base, start: 0, end: 1, mean: 0.2, slope: 1 },
    low: { ...base, start: -1, end: -2, min: -2, max: -1, mean: -1.2, slope: -1 },
    falling: { ...base, start: 4, end: 0, min: 0, max: 4, mean: 1, slope: -4 },
    high: { ...base, start: 0, end: 1, min: 0, max: 1, mean: 0.5, slope: 1 },
    rising: { ...base, start: -1, end: 3, min: -2, max: 3, mean: 0, slope: 4 },
  };

  it.each(Object.entries(compatible) as [Tone, ToneContourSummary][])(
    'erkennt eine mit %s vereinbare Kontur',
    (tone, summary) => expect(matchesTone(tone, summary)).toBe(true)
  );

  it('behaelt die strikten Schwellwerte der Heuristik', () => {
    expect(matchesTone('mid', { ...base, slope: 3 })).toBe(false);
    expect(matchesTone('low', { ...base, mean: -0.5, slope: 0 })).toBe(false);
    expect(matchesTone('falling', { ...base, slope: -3, max: 5, end: 0 })).toBe(false);
    expect(matchesTone('high', { ...base, start: 0, end: 0 })).toBe(false);
    expect(matchesTone('rising', { ...base, start: 0, end: 3, min: 0 })).toBe(false);
  });

  it('erfindet bei einer Einzelaufnahme keine Unterscheidung der Registertoene', () => {
    const flatAtOwnMedian = { ...base, start: 0, end: 0, mean: 0, slope: 0 };

    // Ohne sprecherweite Referenz koennte dieselbe ebene Form mittel, tief
    // oder hoch sein. Ein Boolean wuerde hier Genauigkeit vortaeuschen.
    expect(matchesToneShape('mid', flatAtOwnMedian)).toBeNull();
    expect(matchesToneShape('low', flatAtOwnMedian)).toBeNull();
    expect(matchesToneShape('high', flatAtOwnMedian)).toBeNull();
    expect(matchesTone('low', flatAtOwnMedian)).toBe(false);
  });

  it('behaelt ohne Sprecherreferenz nur die relativen Fall- und Steigformen', () => {
    expect(matchesToneShape('falling', compatible.falling)).toBe(true);
    expect(matchesToneShape('rising', compatible.rising)).toBe(true);
    expect(matchesToneShape('falling', compatible.rising)).toBe(false);
    expect(matchesToneShape('rising', compatible.falling)).toBe(false);
  });
});

describe('Tonhöhenpfad und Oktavkorrektur (17.10.2026)', () => {
  const frame = (f0: number, index: number) => ({ t: index / 100, start: index * 80, rms: 1, f0 });

  it('lässt einen echten großen Fall stehen (กลั้น: 242 → 121 Hz)', () => {
    const fall = [242, 242, 242, 242, 242, 235, 222, 211, 200, 190, 174, 160, 148, 136, 131, 125, 121];
    expect(octaveCorrect(fall.map(frame)).map((candidate) => candidate.f0)).toEqual(fall);
  });

  it('korrigiert weiter einen Wert, der gegen seinen Nachbarn um eine Oktave springt', () => {
    const run = [200, 200, 200, 100, 200, 200, 200].map(frame);
    expect(octaveCorrect(run).map((candidate) => candidate.f0)).toEqual([200, 200, 200, 200, 200, 200, 200]);
  });

  it('folgt mit dem Kandidatenpfad der Periode statt ihrem Vielfachen', () => {
    // 200 Hz mit kräftiger zweiter Harmonischer: die doppelte Periode korreliert fast gleich gut.
    const rate = 8000;
    const samples = Float32Array.from({ length: rate / 2 }, (_, i) =>
      Math.sin((2 * Math.PI * 200 * i) / rate) + 0.6 * Math.sin((2 * Math.PI * 400 * i) / rate));
    const voiced = autocorrF0(samples, rate).filter((candidate) => candidate.f0 > 0);
    expect(voiced.length).toBeGreaterThan(20);
    for (const candidate of voiced) expect(Math.abs(candidate.f0 - 200)).toBeLessThan(10);
  });
});
