import type { VocabEntry } from '@/data/vocab-types';

import { ambiguousPartners, promptText, wordStart } from './ambiguity';

const word = (id: string, term: string, language: VocabEntry['language'], german: string, th?: string): VocabEntry => ({
  id, term, language, german, romanization: term, partOfSpeech: 'verb', register: 'neutral', isConcrete: false,
  sourceVerified: false, translations: th ? { th } : {},
} as unknown as VocabEntry);

const pool = [
  word('ir', 'ir', 'es', 'gehen'),
  word('caminar', 'caminar', 'es', 'gehen'),
  word('comer', 'comer', 'es', 'essen'),
  word('nein', 'nein', 'de', 'Verneinung', 'ไม่'),
  word('nicht', 'nicht', 'de', 'Verneinungspartikel', 'ไม่'),
];

describe('ambiguousPartners', () => {
  it('findet Wörter derselben Sprache mit derselben Vorderseite', () => {
    expect(ambiguousPartners(pool[0], 'de', pool).map((e) => e.id)).toEqual(['caminar']);
    expect(ambiguousPartners(pool[2], 'de', pool)).toEqual([]);
  });

  it('liest die Vorderseite in der Ankersprache', () => {
    expect(promptText(pool[3], 'th')).toBe('ไม่');
    expect(ambiguousPartners(pool[3], 'th', pool).map((e) => e.id)).toEqual(['nicht']);
    // Auf Deutsch sind es verschiedene Erklärungen — keine Mehrdeutigkeit.
    expect(ambiguousPartners(pool[3], 'de', pool)).toEqual([]);
  });
});

describe('wordStart', () => {
  it('gibt den kürzesten unterscheidenden Anfang, bei Thai mindestens zwei Zeichen', () => {
    expect(wordStart(pool[1], [pool[0]])).toBe('c…');
    expect(wordStart(word('doen', 'เดิน', 'th', 'gehen'))).toBe('เด…');
  });

  it('verrät höchstens das halbe Wort und nennt sonst die Länge', () => {
    const pez = word('pez', 'pez', 'es', 'Fisch');
    const pescado = word('pescado', 'pescado', 'es', 'Fisch');
    expect(wordStart(pez, [pescado])).toBe('p… (3)');
    expect(wordStart(pescado, [pez])).toBe('pes…');
  });
});
