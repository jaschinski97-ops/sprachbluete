import { VOCABULARY_TH, VOCABULARY_ES } from '@/test-fixtures/legacy-vocabulary';
import type { VocabEntry } from '@/data/vocab-types';
import { syllablesOf } from '@/data/vocab-helpers';
import { buildDeutschLesenQuestion, buildStressHearQuestion, buildSoundSpellingQuestion } from './drills/questions';
import { graphemeGroups } from './spelling/graphemes';
import { seededRandom } from './drills/random';
import { buildSpeakingPrompt, canBuildSpeakingPrompt } from './speaking/domain';
import { isValidVocabEntry, pruefeVocabDoc } from './content/vocab-schema';
import { dictionaries, UI_LANGUAGES, translate } from './i18n';

describe('Leg-los: bestehende Daten bleiben als Übungsstoff nutzbar', () => {
  it('liest den spanischen Alt-Alias und prüft ungültige Silbenfelder', () => {
    const word = { ...VOCABULARY_ES.find(e => e.syllables.length > 1)!,
      syllables: [{ syllable: 'ma', stressed: false }, { syllable: 'má', stressed: true }] } as unknown as VocabEntry;
    expect(syllablesOf(word).map(s => s.roman)).toEqual(['ma', 'má']);
    expect(buildStressHearQuestion(word).options.map(o => o.label)).toEqual(['ma', 'ma']);
    expect(isValidVocabEntry(word)).toBe(true);
    const broken = { ...word, syllables: [{ stressed: true }] } as VocabEntry;
    expect(isValidVocabEntry(broken)).toBe(false);
    expect(pruefeVocabDoc(broken).ok).toBe(false);
  });

  it('fragt deutsche Wörter über den thailändischen Anker', () => {
    const words = ['gehen', 'sehen', 'geben', 'lesen'].map((term, i) => ({
      ...VOCABULARY_TH[0], id: `de-${i}`, language: 'de', term, german: term,
      translations: { th: ['ไป', 'เห็น', 'ให้', 'อ่าน'][i] },
    })) as unknown as VocabEntry[];
    const question = buildDeutschLesenQuestion(words[0], words, seededRandom(1), 'th_to_de');
    expect(question.visible).toBe('ไป');
    expect(question.options[question.correctIndex].label).toBe('gehen');
  });

  it('nutzt kreuzgeprüfte Thai-Einsilber ohne Quellprüfung vorzutäuschen', () => {
    const word = { ...VOCABULARY_TH.find(e => e.syllables.length === 1)!, sourceVerified: false,
      verificationNote: 'KI-Kreuzprüfung bestanden (Test)' };
    expect(canBuildSpeakingPrompt(word)).toBe(true);
    expect(buildSpeakingPrompt(word)).toMatchObject({ sourceVerified: false,
      targetSource: 'cross-checked-vocabulary-syllables', targetTone: word.syllables[0].tone });
    expect(canBuildSpeakingPrompt({ ...word, verificationNote: 'KI-erzeugt, ungeprüft' })).toBe(false);
  });

  it('hält große Hörgruppen bei vier eindeutigen Antworten inklusive Lösung', () => {
    const words = Array.from({ length: 30 }, (_, i) => ({
      ...VOCABULARY_ES[0], language: 'en', id: 'word-' + i, term: 'term-' + i,
      englishSpelling: { grapheme: 'ea', sound: i % 2 ? 'iː' : 'e' },
    })) as unknown as VocabEntry[];
    const question = buildSoundSpellingQuestion(words[29], graphemeGroups(words));
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options.map(o => o.label)).size).toBe(4);
    expect(question.options[question.correctIndex].label).toBe('term-29');
  });

  it('zeigt in allen 20 Sprachen einen Prüfen-Knopf ohne Fortschritts-Platzhalter', () => {
    for (const language of UI_LANGUAGES) {
      expect(dictionaries[language]['writing.check']).toBe(dictionaries[language]['dictation.check']);
      expect(translate(language, 'writing.check')).not.toContain('{{');
    }
  });
});
