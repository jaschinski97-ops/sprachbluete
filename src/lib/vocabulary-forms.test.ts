import type { VocabEntry } from '@/data/vocab-types';
import { tokenisiereFuerAntippen, poolWoerterDerSzene } from './reading-texts';
import { vocabularyForms } from './vocabulary-forms';
import type { ConversationSituation } from './conversation/types';

const word = (term: string, language: VocabEntry['language'], extra: Partial<VocabEntry> = {}): VocabEntry => ({
  id: `${language}-${term}`, term, language, romanization: term, german: term,
  syllables: [], partOfSpeech: 'noun', register: 'neutral', isConcrete: true, sourceVerified: false, ...extra,
});

it('includes stored German and Spanish plurals and English noun plurals, without substring matches', () => {
  const pool = [word('Apfel', 'de', { germanNoun: { article: 'der', plural: 'Äpfel' } }), word('plátano', 'es', { spanishNoun: { article: 'el', gender: 'm', plural: 'plátanos' } }), word('apple', 'en')];
  const text = 'Äpfel plátanos apples pineapple';
  expect(tokenisiereFuerAntippen(text, pool, true).filter(token => token.entry).map(token => token.entry?.term)).toEqual(['Apfel', 'plátano', 'apple']);
  const scene = { scriptTurns: [{ thai: text }], direction: 'de_to_en' } as ConversationSituation;
  expect(poolWoerterDerSzene(scene, pool, true)).toEqual(pool);
  expect(vocabularyForms(word('water', 'en'))).toEqual(['water']);
});

it('does not attach the noun gloss Hilfe to a verbal help or she to an ambiguous German Sie/sie', () => {
  const help = word('help', 'en', { german: 'Hilfe' });
  expect(tokenisiereFuerAntippen('Can I help you?', [help], true).some(token => token.entry)).toBe(false);
  const verb = word('help', 'en', { id: 'help-verb', partOfSpeech: 'verb', german: 'helfen' });
  expect(tokenisiereFuerAntippen('Can I help you?', [help, verb], true).find(token => token.entry)?.entry?.german).toBe('helfen');
  const sie = word('sie', 'de', { partOfSpeech: 'pronoun', german: 'she' });
  expect(tokenisiereFuerAntippen('Möchten Sie Äpfel? Was kosten sie?', [sie], true).some(token => token.entry)).toBe(false);
});
