import { termWithArticle } from '@/data/vocab-helpers';
import { VOCABULARY_IT } from '@/test-fixtures/vocabulary-it';
import { VOCABULARY_PT } from '@/test-fixtures/vocabulary-pt';

import { seedVocabulary } from '../repository';
import { MemoryDataStore } from '../storage';

import { buildArticoloQuestion, buildGeneroQuestion, canBuildArticoloQuestion, canBuildGeneroQuestion } from './questions';
import { buildDrillSession } from './session';
import { DRILL_META } from './types';

/**
 * „um oder uma?“ (Portugiesisch) und „un, uno, una?“ (Italienisch), 07.11.2026:
 * Gefragt wird der unbestimmte Artikel. Italienisch leitet ihn aus dem
 * bestimmten ab (il → un, lo → uno, la → una, l’ → un/un’ nach Genus).
 */

const pt = (id: string) => VOCABULARY_PT.find((entry) => entry.id === id)!;
const it_ = (id: string) => VOCABULARY_IT.find((entry) => entry.id === id)!;

describe('Genus (Portugiesisch)', () => {
  it('ist eine Grammatikübung der Zielsprache', () => {
    expect(DRILL_META.genero).toMatchObject({ side: 'toTarget', feature: 'pt', skill: 'grammatik' });
  });

  it('nimmt nur portugiesische Nomen und fragt um/uma', () => {
    expect(canBuildGeneroQuestion(pt('pt_casa'))).toBe(true);
    expect(canBuildGeneroQuestion(pt('pt_comer'))).toBe(false);
    const casa = buildGeneroQuestion(pt('pt_casa'));
    expect(casa.options.map((option) => option.label)).toEqual(['um', 'uma']);
    expect(casa.solution).toBe('uma casa');
    expect(casa.explanation.startsWith('a casa')).toBe(true);
    expect(buildGeneroQuestion(pt('pt_livro')).solution).toBe('um livro');
    expect(casa.direction).toBe('de_to_pt');
  });
});

describe('Artikel (Italienisch)', () => {
  it('ist eine Grammatikübung der Zielsprache', () => {
    expect(DRILL_META.articolo).toMatchObject({ side: 'toTarget', feature: 'it', skill: 'grammatik' });
  });

  it('leitet un, uno, una und un’ aus Artikel und Genus ab', () => {
    expect(canBuildArticoloQuestion(it_('it_libro'))).toBe(true);
    expect(canBuildArticoloQuestion(it_('it_andare'))).toBe(false);
    const loesung = (id: string) => buildArticoloQuestion(it_(id)).solution;
    expect(loesung('it_libro')).toBe('un libro');
    expect(loesung('it_zucchero')).toBe('uno zucchero');
    expect(loesung('it_casa')).toBe('una casa');
    expect(loesung('it_amico')).toBe('un amico');
    expect(loesung('it_acqua')).toBe('un’acqua');
    expect(buildArticoloQuestion(it_('it_libro')).options.map((option) => option.label)).toEqual(['un', 'uno', 'una', 'un’']);
  });

  it('zeigt an der Karte „l’“ ohne Leerzeichen', () => {
    expect(termWithArticle(it_('it_acqua'))).toBe('l’acqua');
    expect(termWithArticle(it_('it_zucchero'))).toBe('lo zucchero');
    expect(termWithArticle(pt('pt_carro'))).toBe('o carro');
  });

  it('baut Sitzungen aus dem Bestand', async () => {
    const store = new MemoryDataStore();
    await store.init();
    await seedVocabulary(store);
    for (const [drill, language] of [['genero', 'pt'], ['articolo', 'it']] as const) {
      const session = await buildDrillSession({ drill, language, store, seed: 7, now: Date.UTC(2026, 10, 7) });
      expect(session.questions.length).toBeGreaterThan(0);
      for (const question of session.questions) expect(question.vocabId.startsWith(`${language}_`)).toBe(true);
    }
  });
});
