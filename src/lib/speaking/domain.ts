/**
 * Fachliche Regeln der Sprechuebung.
 *
 * Die Sollkontur kommt ausschliesslich aus dem verifizierten
 * `syllables[0].tone` des Vokabeleintrags. TTS-Clips duerfen die Oberflaeche
 * spaeter als gekennzeichnetes Hoerbeispiel abspielen, sind aber weder Eingabe
 * dieses Moduls noch Bewertungsmassstab.
 */

import { Tone, TONE_KEYS, TONES } from '@/constants/tones';
import type { VocabEntry } from '@/data/vocab-types';

import { matchesTone, matchesToneShape, ToneContourMeasurement } from './analysis';

/** Muss im UI neben jeder Rueckmeldung sichtbar sein. */
export const SPEAKING_LIMITATIONS = [
  'Bewertet wird nur die Tonhöhenkontur.',
  'Konsonanten, Vokallänge und Aspiration werden nicht geprüft.',
  'Die lokale F0-Messung ist eine Heuristik und kann besonders bei Rauschen, Nasalen und sehr kurzen Silben irren.',
  'Nur wenn keine ausreichend lange sichere Tonspur gefunden wird, werden schwach korrelierte Fenster als sprungfreie Fortsetzung berücksichtigt; das verhindert nicht alle Messfehler.',
  'Die einmalige 1,8-fache Oktavkorrektur fängt nur grobe Einzelsprünge; mehrere oder überwiegende Oktavfehler können bestehen bleiben.',
  'Ohne eine persönliche Referenz aus mehreren Aufnahmen wird nur die Konturform verglichen; die absolute Lage von mittel, tief und hoch ist dann nicht kalibriert.',
] as const;

export type SpeakingPrompt = {
  id: string;
  vocabId: string;
  thai: string;
  romanization: string;
  german: string;
  /** Bedeutungen je App-Sprache — die Übung zeigt die der Lernrichtung. */
  translations?: VocabEntry['translations'];
  source: string | null;
  sourceVerified: boolean;
  syllableIndex: 0;
  syllableRomanization: string;
  /** Sollton aus `syllables[0].tone`, niemals aus einem Audio-Clip. */
  targetTone: Tone;
  targetSource: 'verified-vocabulary-syllables' | 'cross-checked-vocabulary-syllables';
};

export type ToneContourVerdict =
  | 'compatible'
  | 'needs-work'
  | 'register-uncalibrated'
  | 'unmeasurable';

/**
 * Qualitative Rueckmeldung ohne Punktzahl und ohne Behauptung, die gesamte
 * Aussprache sei richtig oder falsch.
 */
export type ToneContourFeedback = {
  kind: 'tone-contour-feedback';
  scope: 'tone-contour-only';
  verdict: ToneContourVerdict;
  targetTone: Tone;
  targetLabel: string;
  comparisonBasis: 'shape-only' | 'speaker-baseline';
  message: string;
  limitations: typeof SPEAKING_LIMITATIONS;
};

/**
 * Das HTML-Verfahren bewertet eine einzelne zusammenhaengende stimmhafte
 * Strecke. Ohne gepruefte Silbengrenzen kann es ein mehrsilbiges Wort deshalb
 * nicht ehrlich mehreren Solltoenen zuordnen (AE-7/AE-8).
 */
/**
 * Sind die Solltöne belastbar? Quellengeprüft, KI-kreuzgeprüft oder (seit
 * 24.10.2026) gegen die Thai-Tonregeln aus der Schrift geprüft — solche
 * Wörter tragen „regelgeprüft“ im Vermerk; der Helper nimmt sie nur ohne
 * Ton-Widerspruch an (`pruefeVocabDoc`).
 */
export function hatBelastbareToene(entry: VocabEntry): boolean {
  const note = entry.verificationNote ?? '';
  return entry.sourceVerified === true || note.startsWith('KI-Kreuzprüfung bestanden') || (note.startsWith('KI-') && note.includes('regelgeprüft'));
}

export function canBuildSpeakingPrompt(entry: VocabEntry): boolean {
  return (
    // Seit Phase 16: Die Sprechuebung misst Tonhoehenkonturen und gilt damit
    // fuer Thai. Ob dasselbe Verfahren spanische Betonung erkennen kann, ist
    // eine offene Frage und keine Selbstverstaendlichkeit (AE-48).
    entry.language === 'th' &&
    hatBelastbareToene(entry) &&
    Array.isArray(entry.syllables) &&
    entry.syllables.length === 1 &&
    entry.syllables[0].tone !== undefined &&
    TONE_KEYS.includes(entry.syllables[0].tone)
  );
}

export function buildSpeakingPrompt(entry: VocabEntry): SpeakingPrompt {
  if (!hatBelastbareToene(entry)) {
    throw new Error(
      `"${entry.id}" ist nicht vollständig quellengeprüft — daraus wird keine Sollkontur gebaut.`
    );
  }
  if (!Array.isArray(entry.syllables) || entry.syllables.length !== 1) {
    throw new Error(
      `"${entry.id}" ist nicht einsilbig — die Aufnahme kann ohne geprüfte Silbengrenzen keinem einzelnen Sollton zugeordnet werden.`
    );
  }

  const syllable = entry.syllables[0];
  if (syllable.tone === undefined || !TONE_KEYS.includes(syllable.tone)) {
    throw new Error(`"${entry.id}" hat keinen bekannten, geprüften Sollton.`);
  }

  return {
    id: `speaking:${entry.id}`,
    vocabId: entry.id,
    thai: entry.term,
    romanization: entry.romanization,
    german: entry.german,
    translations: entry.translations,
    source: entry.source ?? null,
    sourceVerified: entry.sourceVerified,
    syllableIndex: 0,
    syllableRomanization: syllable.roman,
    targetTone: syllable.tone,
    targetSource: entry.sourceVerified ? 'verified-vocabulary-syllables' : 'cross-checked-vocabulary-syllables',
  };
}

export function buildSpeakingPrompts(entries: readonly VocabEntry[]): SpeakingPrompt[] {
  return entries.filter(canBuildSpeakingPrompt).map(buildSpeakingPrompt);
}

const NEEDS_WORK: Record<Tone, string> = {
  mid: 'Die gemessene Kontur war bewegter als die erwartete mittlere Form.',
  low: 'Die gemessene Kontur entsprach noch nicht der tiefen, ebenen bis fallenden Form.',
  falling: 'Die Tonhöhe fiel noch nicht deutlich genug von einem hohen Anfang ab.',
  high: 'Das Ende lag noch nicht in der erwarteten hohen beziehungsweise steigenden Form.',
  rising: 'Nach der Senke stieg die Tonhöhe noch nicht deutlich genug an.',
};

export function feedbackForMeasurement(
  prompt: SpeakingPrompt,
  measurement: ToneContourMeasurement
): ToneContourFeedback {
  const targetLabel = TONES[prompt.targetTone].label;

  if (measurement.status === 'unmeasurable') {
    return {
      kind: 'tone-contour-feedback',
      scope: 'tone-contour-only',
      verdict: 'unmeasurable',
      targetTone: prompt.targetTone,
      targetLabel,
      comparisonBasis: 'shape-only',
      message:
        'Keine ausreichend lange zusammenhängende Tonhöhe messbar. Bitte in ruhiger Umgebung noch einmal sprechen.',
      limitations: SPEAKING_LIMITATIONS,
    };
  }

  const comparisonBasis =
    measurement.referenceKind === 'speaker-baseline' ? 'speaker-baseline' : 'shape-only';
  const compatible =
    comparisonBasis === 'speaker-baseline'
      ? matchesTone(prompt.targetTone, measurement.summary)
      : matchesToneShape(prompt.targetTone, measurement.summary);

  if (compatible === null) {
    return {
      kind: 'tone-contour-feedback',
      scope: 'tone-contour-only',
      verdict: 'register-uncalibrated',
      targetTone: prompt.targetTone,
      targetLabel,
      comparisonBasis,
      message:
        `Die Kontur wurde gemessen. Ohne persönliche Referenz lässt sich der Sollton „${targetLabel}“ ` +
        'aber nicht zuverlässig von den anderen Registertönen mittel, tief und hoch unterscheiden.',
      limitations: SPEAKING_LIMITATIONS,
    };
  }

  if (compatible) {
    return {
      kind: 'tone-contour-feedback',
      scope: 'tone-contour-only',
      verdict: 'compatible',
      targetTone: prompt.targetTone,
      targetLabel,
      comparisonBasis,
      message:
        comparisonBasis === 'speaker-baseline'
          ? `Die gemessene Tonhöhenkontur ist mit dem Sollton „${targetLabel}“ vereinbar.`
          : `Die gemessene Konturform ist mit dem Sollton „${targetLabel}“ vereinbar; die absolute Sprechlage wurde nicht bewertet.`,
      limitations: SPEAKING_LIMITATIONS,
    };
  }

  return {
    kind: 'tone-contour-feedback',
    scope: 'tone-contour-only',
    verdict: 'needs-work',
    targetTone: prompt.targetTone,
    targetLabel,
    comparisonBasis,
    message:
      comparisonBasis === 'shape-only'
        ? `${NEEDS_WORK[prompt.targetTone]} Bewertet wurde nur die relative Form, nicht die absolute Sprechlage.`
        : NEEDS_WORK[prompt.targetTone],
    limitations: SPEAKING_LIMITATIONS,
  };
}
