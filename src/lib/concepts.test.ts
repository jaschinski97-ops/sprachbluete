import { imageKeyOf, isSharedConcept, normalizeConcept } from './concepts';

describe('Begriffskennungen', () => {
  it('normalisiert KI-Angaben', () => {
    expect(normalizeConcept('Bank (money)')).toBe('c:bank_money');
    expect(normalizeConcept('to eat')).toBe('c:eat');
    expect(normalizeConcept('c:Apple')).toBe('c:apple');
    expect(normalizeConcept('café')).toBe('c:cafe');
    expect(normalizeConcept('  ')).toBeNull();
  });

  it('unterscheidet gemeinsame Kennungen von alten Wort-IDs', () => {
    expect(isSharedConcept('c:house')).toBe(true);
    expect(isSharedConcept('ki-en-e05784d0')).toBe(false);
    expect(imageKeyOf({ id: 'ki-th-1', concept: 'c:house' })).toBe('c:house');
    expect(imageKeyOf({ id: 'ki-th-1', concept: 'ki-th-1' })).toBe('ki-th-1');
  });
});
