import { CONSONANT_BY_SYMBOL, THAI_CONSONANTS } from '@/data/thai-script';
import type { VocabEntry } from '@/data/vocab-types';

import { sollAusSchriftUndUmschrift } from './content/soll-toene-schrift';
import { romanSyllableProblem, toneOfRoman } from './content/thai-romanization';
import { seededRandom } from './drills/random';
import { modesForDirection } from './exercise-catalog';
import {
  FOUNDATION_SPECIAL_VOWELS,
  FOUNDATION_VOWELS,
  foundationModesFor,
  foundationSteps,
  NUMBER_QUIZ_VALUES,
  numberQuestions,
  paiboonVowel,
  PRICE_QUIZ_VALUES,
  spellingQuestions,
  spellingWords,
  thaiConsonantKeywordRoman,
  thaiConsonantSpoken,
  thaiConsonantSyllable,
  toneExampleCandidates,
  toneMarkedVowel,
  vowelPattern,
} from './foundations';

describe('Kapitel 0: Schritte', () => {
  it('Thai: Zahlen, Preise, Schrift und Töne; Latein: Zahlen, Preise, ABC, Buchstabieren', () => {
    expect(foundationSteps('de_to_th').map(([mode]) => mode))
      .toEqual(['zahlen', 'preise', 'konsonanten', 'konsonantenklasse', 'vokale', 'toene', 'tone']);
    for (const direction of ['th_to_de', 'de_to_en', 'de_to_es'] as const) {
      expect(foundationSteps(direction).map(([mode]) => mode)).toEqual(['zahlen', 'preise', 'abc', 'buchstabieren']);
    }
  });

  it('jeder geliehene Übungsschritt existiert in der Richtung', () => {
    const steps = foundationSteps('de_to_th').map(([mode]) => mode);
    const own = foundationModesFor('de_to_th');
    for (const mode of steps.filter((step) => !own.includes(step as never))) {
      expect(modesForDirection('de_to_th')).toContain(mode);
    }
  });
});

describe('Kapitel 0: Thai-Schrift', () => {
  it('jedes der 44 Merkwörter hat eine Umschrift, die zu den Tonregeln passt', () => {
    for (const consonant of THAI_CONSONANTS) {
      const roman = thaiConsonantKeywordRoman(consonant);
      const merkwort = consonant.name.split(' ').slice(1).join(' ');
      expect({ merkwort, roman: roman !== null }).toEqual({ merkwort, roman: true });
      expect({ merkwort, art: sollAusSchriftUndUmschrift(merkwort, roman!, 'wort')?.art }).toEqual({ merkwort, art: 'ok' });
      for (const silbe of roman!.split('-')) expect({ silbe, problem: romanSyllableProblem(silbe) }).toEqual({ silbe, problem: null });
    }
  });

  it('leitet die Konsonantennamen aus Klasse und Anlaut her', () => {
    const names = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ต', 'ป', 'อ', 'ห', 'ฮ'].map((symbol) => thaiConsonantSyllable(CONSONANT_BY_SYMBOL[symbol]));
    expect(names).toEqual(['gɔɔ', 'khɔ̌ɔ', 'khɔɔ', 'ngɔɔ', 'jɔɔ', 'chɔ̌ɔ', 'dtɔɔ', 'bpɔɔ', 'ɔɔ', 'hɔ̌ɔ', 'hɔɔ'].map((name) => name.normalize('NFC')));
    expect(thaiConsonantSpoken(CONSONANT_BY_SYMBOL['ก'])).toBe('กอ ไก่');
  });

  it('alle 44 Namen folgen der Umschrift-Konvention; Hochklasse steigt, sonst mittel', () => {
    for (const consonant of THAI_CONSONANTS) {
      const syllable = thaiConsonantSyllable(consonant);
      expect(romanSyllableProblem(syllable)).toBeNull();
      expect(toneOfRoman(syllable)).toBe(consonant.consonantClass === 'high' ? 'rising' : 'mid');
    }
  });

  it('jedes Vokalpaar besteht aus Mustern der Quelle, kurz neben lang', () => {
    for (const pair of FOUNDATION_VOWELS) {
      for (const display of pair.short) expect(vowelPattern(display).length).toBe('short');
      for (const display of pair.long) expect(vowelPattern(display).length).toBe('long');
      const shortRoman = paiboonVowel(vowelPattern(pair.short[0]));
      const longRoman = paiboonVowel(vowelPattern(pair.long[0]));
      expect(romanSyllableProblem(shortRoman)).toBeNull();
      expect(romanSyllableProblem(longRoman)).toBeNull();
    }
    expect(FOUNDATION_SPECIAL_VOWELS.map((display) => paiboonVowel(vowelPattern(display)))).toEqual(['am', 'ai', 'ai', 'ao']);
  });

  it('zeigt die Tonzeichen der Umschrift', () => {
    expect((['mid', 'low', 'falling', 'high', 'rising'] as const).map(toneMarkedVowel)).toEqual(['a', 'à', 'â', 'á', 'ǎ']);
  });

  it('wählt Tonbeispiele nur aus einsilbigen Thai-Wörtern', () => {
    const word = (id: string, term: string, tone: VocabEntry['syllables'][number]['tone'], syllables = 1): VocabEntry => ({
      id, term, language: 'th', romanization: term, german: term, partOfSpeech: 'noun', register: 'neutral',
      isConcrete: true, sourceVerified: false, generatedAt: Number(id.slice(1)),
      syllables: Array.from({ length: syllables }, () => ({ roman: term, tone })),
    });
    const picks = toneExampleCandidates([word('w2', 'หมา', 'rising'), word('w1', 'ไม่', 'falling'), word('w3', 'ทหาร', 'high', 2)]);
    expect(picks.rising.map((entry) => entry.term)).toEqual(['หมา']);
    expect(picks.falling.map((entry) => entry.term)).toEqual(['ไม่']);
    expect(picks.high).toEqual([]);
  });
});

describe('Kapitel 0: Aufgaben', () => {
  it('Zahlen- und Preisfragen haben vier verschiedene Antworten mit genau einer richtigen', () => {
    for (const values of [NUMBER_QUIZ_VALUES, PRICE_QUIZ_VALUES]) {
      const questions = numberQuestions(values, seededRandom(7), 12);
      expect(new Set(questions.map((question) => question.answer)).size).toBe(questions.length);
      for (const question of questions) {
        expect(new Set(question.options).size).toBe(4);
        expect(question.options[question.correctIndex]).toBe(question.answer);
        expect(question.options.every((option) => values.includes(option) || Number.isInteger(option))).toBe(true);
      }
    }
  });

  it('Buchstabieren nimmt nur kurze, buchstabierbare Anfängerwörter in Erzeugungsreihenfolge', () => {
    const entry = (id: string, term: string, extra: Partial<VocabEntry> = {}): VocabEntry => ({
      id, term, language: 'de', romanization: term, german: term, partOfSpeech: 'noun', register: 'neutral',
      isConcrete: true, sourceVerified: false, syllables: [], generatedAt: Number(id.slice(1)), ...extra,
    });
    const words = spellingWords('de', [
      entry('w5', 'Straße'), entry('w1', 'Haus'), entry('w2', 'Eis'), entry('w3', 'Kühlschrank'),
      entry('w4', 'Café'), entry('w6', 'Ei'), entry('w7', 'Brot', { learningStage: 'experienced' }), entry('w8', 'haus'),
    ]);
    expect(words.map((word) => word.term)).toEqual(['Haus', 'Eis', 'Straße']);
    const questions = spellingQuestions([...words, entry('w9', 'Hund'), entry('w10', 'Tisch')], seededRandom(3), 5);
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
      expect(question.options[question.correctIndex]).toBe(question.answer);
    }
    expect(spellingQuestions(words, seededRandom(1))).toEqual([]);
  });
});
