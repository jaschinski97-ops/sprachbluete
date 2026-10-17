import { Tone } from '@/constants/tones';
// PHASE 16: `VOCABULARY` umfasst jetzt alle drei Sprachen. Was diese Datei
// zusichert, gilt dem Thai-Grundstock aus Phase 2 - deshalb hier
// ausdruecklich der. Unterhalb dieser Zeile hat sich nichts geaendert.
import { findVocab, VOCABULARY_TH as VOCABULARY, VocabEntry } from '@/test-fixtures/legacy-vocabulary';

import { F0Frame, ToneContourMeasurement, ToneContourSummary } from './analysis';
import {
  buildSpeakingPrompt,
  buildSpeakingPrompts,
  canBuildSpeakingPrompt,
  feedbackForMeasurement,
  SPEAKING_LIMITATIONS,
} from './domain';

function entry(id: string): VocabEntry {
  const found = findVocab(id);
  if (!found) throw new Error(`Testeintrag fehlt: ${id}`);
  return found;
}

const baseSummary: ToneContourSummary = {
  pts: [-1, -2, -2, -1, 1, 3],
  start: -1,
  end: 3,
  min: -2,
  max: 3,
  mean: 0,
  slope: 4,
  durMs: 300,
};

const span: F0Frame[] = Array.from({ length: 6 }, (_, index) => ({
  t: index * 0.01,
  start: index * 80,
  rms: 0.5,
  f0: 100,
}));

function measured(summary: ToneContourSummary = baseSummary): ToneContourMeasurement {
  return {
    status: 'measured',
    inputSampleRate: 8_000,
    analysisSampleRate: 8_000,
    frames: span,
    span,
    voicedMs: 60,
    referenceHz: 100,
    referenceKind: 'attempt-median',
    summary,
  };
}

describe('Sollkontur aus verifizierten Vokabeldaten', () => {
  it('nimmt nur vollständig verifizierte einsilbige Eintraege', () => {
    expect(canBuildSpeakingPrompt(entry('gai'))).toBe(true);
    expect(canBuildSpeakingPrompt(entry('sawatdii'))).toBe(false);
    expect(canBuildSpeakingPrompt(entry('raan'))).toBe(false);
  });

  it('verweigert mehrsilbige und unverifizierte Eintraege mit benanntem Grund', () => {
    expect(() => buildSpeakingPrompt(entry('sawatdii'))).toThrow(/nicht einsilbig/);
    expect(() => buildSpeakingPrompt(entry('raan'))).toThrow(/nicht vollständig quellengeprüft/);
  });

  it('leitet den Sollton aus syllables[0] ab, nie aus tone oder audioAssetId', () => {
    const widerspruch = {
      ...entry('gai'),
      tone: 'falling' as Tone,
      syllables: [{ roman: 'gài', tone: 'rising' as Tone }],
      audioAssetId: 'tts-clip-mit-absichtlich-falschem-ton',
      sourceVerified: true,
    };

    const prompt = buildSpeakingPrompt(widerspruch);
    expect(prompt.targetTone).toBe('rising');
    expect(prompt.targetTone).not.toBe(widerspruch.tone);
    expect(prompt.targetSource).toBe('verified-vocabulary-syllables');
    expect(prompt).not.toHaveProperty('audioAssetId');
  });

  it('haelt fuer jeden gebauten Prompt Quelle, Silbe und Sollton zusammen', () => {
    const prompts = buildSpeakingPrompts(VOCABULARY);
    expect(prompts.length).toBeGreaterThan(20);

    for (const prompt of prompts) {
      const original = entry(prompt.vocabId);
      expect(original.sourceVerified).toBe(true);
      expect(original.syllables).toHaveLength(1);
      expect(prompt.sourceVerified).toBe(true);
      expect(prompt.syllableIndex).toBe(0);
      expect(prompt.syllableRomanization).toBe(original.syllables[0].roman);
      expect(prompt.targetTone).toBe(original.syllables[0].tone);
    }
  });
});

describe('ehrliche qualitative Rueckmeldung', () => {
  it('nennt eine passende Kontur nur vereinbar, nicht die Aussprache richtig', () => {
    const prompt = buildSpeakingPrompt(entry('maa_dog'));
    const feedback = feedbackForMeasurement(prompt, measured());

    expect(feedback.verdict).toBe('compatible');
    expect(feedback.scope).toBe('tone-contour-only');
    expect(feedback.comparisonBasis).toBe('shape-only');
    expect(feedback.message).toMatch(/Kontur|kontur/);
    expect(feedback.message).toMatch(/absolute Sprechlage wurde nicht bewertet/);
    expect(feedback.message).not.toMatch(/Aussprache (ist )?richtig/i);
    expect(feedback).not.toHaveProperty('score');
    expect(feedback).not.toHaveProperty('correct');
  });

  it('gibt bei einer unpassenden Form einen tonbezogenen Hinweis statt einer Punktzahl', () => {
    const prompt = buildSpeakingPrompt(entry('maa_dog'));
    const feedback = feedbackForMeasurement(
      prompt,
      measured({ ...baseSummary, start: 2, end: -3, min: -3, max: 2, slope: -5 })
    );

    expect(feedback.verdict).toBe('needs-work');
    expect(feedback.targetTone).toBe('rising');
    expect(feedback.message).toContain('stieg');
    expect(feedback).not.toHaveProperty('score');
  });

  it('gibt fuer mittel, tief und hoch ohne Sprecherreferenz kein Scheinurteil ab', () => {
    const prompt = buildSpeakingPrompt(entry('gai'));
    const flatAtReference = measured({
      ...baseSummary,
      pts: [0, 0, 0, 0, 0, 0],
      start: 0,
      end: 0,
      min: 0,
      max: 0,
      mean: 0,
      slope: 0,
    });

    const shapeOnly = feedbackForMeasurement(prompt, flatAtReference);
    expect(shapeOnly.verdict).toBe('register-uncalibrated');
    expect(shapeOnly.comparisonBasis).toBe('shape-only');
    expect(shapeOnly.message).toMatch(/nicht zuverlässig/);

    if (flatAtReference.status !== 'measured') throw new Error('Testaufbau ist messbar.');
    const withBaseline: ToneContourMeasurement = {
      ...flatAtReference,
      referenceKind: 'speaker-baseline',
    };
    const calibrated = feedbackForMeasurement(prompt, withBaseline);
    expect(calibrated.verdict).toBe('needs-work');
    expect(calibrated.comparisonBasis).toBe('speaker-baseline');
  });

  it('kann ohne absolute Referenz weiterhin relative Steig- und Fallformen pruefen', () => {
    const rising = feedbackForMeasurement(buildSpeakingPrompt(entry('maa_dog')), measured());
    expect(rising.targetTone).toBe('rising');
    expect(rising.verdict).toBe('compatible');

    const falling = feedbackForMeasurement(
      buildSpeakingPrompt(entry('kha')),
      measured({ ...baseSummary, start: 3, end: -2, min: -2, max: 3, slope: -5 })
    );
    expect(falling.targetTone).toBe('falling');
    expect(falling.verdict).toBe('compatible');

    const high = feedbackForMeasurement(
      buildSpeakingPrompt(entry('maa_horse')),
      measured({ ...baseSummary, start: 3, end: -2, min: -2, max: 3, slope: -5 })
    );
    // Hoch ist ohne Sprecherreferenz selbst mit Kurve kein objektives Urteil.
    expect(high.verdict).toBe('register-uncalibrated');
  });

  it('erfindet bei fehlender stimmhafter Strecke kein Urteil', () => {
    const prompt = buildSpeakingPrompt(entry('gai'));
    const feedback = feedbackForMeasurement(prompt, {
      status: 'unmeasurable',
      reason: 'no-voiced-run',
      inputSampleRate: 8_000,
      analysisSampleRate: 8_000,
      frames: [],
      voicedMs: 0,
    });

    expect(feedback.verdict).toBe('unmeasurable');
    expect(feedback.message).toMatch(/noch einmal/);
  });

  it('benennt Bewertungsgrenzen und lokale Verarbeitung als UI-Textbausteine', () => {
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Tonhöhenkontur/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Konsonanten/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Vokallänge/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Aspiration/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Oktavkorrektur/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/Oktavfehler/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/absolute Lage/);
    expect(SPEAKING_LIMITATIONS.join(' ')).toMatch(/nicht kalibriert/);
  });
});
