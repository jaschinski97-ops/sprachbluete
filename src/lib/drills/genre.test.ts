import { termWithArticle } from '@/data/vocab-helpers';
import { VOCABULARY_FR } from '@/test-fixtures/vocabulary-fr';

import { seedVocabulary } from '../repository';
import { MemoryDataStore } from '../storage';

import { buildGenreQuestion, canBuildGenreQuestion } from './questions';
import { buildDrillSession } from './session';
import { DRILL_META } from './types';

/**
 * „un oder une?“ (Französisch, 04.11.2026): Das Genus wird am unbestimmten
 * Artikel gefragt, weil „l’“ es vor Vokal verschluckt („l’eau“ ist weiblich,
 * „l’ami“ männlich).
 */

const wort = (id: string) => VOCABULARY_FR.find((entry) => entry.id === id)!;

describe('Genus (Französisch)', () => {
  it('ist eine Grammatikübung der Zielsprache', () => {
    expect(DRILL_META.genre).toMatchObject({ side: 'toTarget', feature: 'fr', skill: 'grammatik' });
  });

  it('nimmt nur französische Nomen mit Genus', () => {
    expect(canBuildGenreQuestion(wort('fr_maison'))).toBe(true);
    expect(canBuildGenreQuestion(wort('fr_manger'))).toBe(false);
  });

  it('fragt un/une und löst auch hinter „l’“ richtig auf', () => {
    const eau = buildGenreQuestion(wort('fr_eau'));
    expect(eau.visible).toBe('___ eau');
    expect(eau.options.map((option) => option.label)).toEqual(['un', 'une']);
    expect(eau.options[eau.correctIndex].label).toBe('une');
    expect(eau.solution).toBe('une eau');
    expect(eau.explanation.startsWith('l’eau')).toBe(true);

    const ami = buildGenreQuestion(wort('fr_ami'));
    expect(ami.options[ami.correctIndex].label).toBe('un');
    expect(ami.direction).toBe('de_to_fr');
  });

  it('baut eine Sitzung aus dem Bestand', async () => {
    const store = new MemoryDataStore();
    await store.init();
    await seedVocabulary(store);
    const session = await buildDrillSession({ drill: 'genre', language: 'fr', store, seed: 7, now: Date.UTC(2026, 10, 4) });
    expect(session.questions.length).toBeGreaterThan(0);
    for (const question of session.questions) expect(question.vocabId.startsWith('fr_')).toBe(true);
  });
});

describe('Artikel an der Karte', () => {
  it('setzt „l’“ ohne Leerzeichen und „le/la“ mit Leerzeichen davor', () => {
    expect(termWithArticle(wort('fr_eau'))).toBe('l’eau');
    expect(termWithArticle(wort('fr_maison'))).toBe('la maison');
    expect(termWithArticle(wort('fr_chat'))).toBe('le chat');
    expect(termWithArticle(wort('fr_manger'))).toBe('manger');
  });
});
