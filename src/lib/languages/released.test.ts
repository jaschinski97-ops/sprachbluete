import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseReleasedLanguages } from './released';
import { LANGUAGE_CODES } from './types';

/**
 * Update 1.1 (08.11.2026) ohne die neuen Lernsprachen: Der Store-Build zeigt
 * nur Sprachen mit veröffentlichtem Sprachpaket.
 */
describe('freigegebene Lernsprachen', () => {
  it('ohne Angabe gelten alle (Entwicklung, Studio, Tests)', () => {
    expect(parseReleasedLanguages(undefined)).toEqual(LANGUAGE_CODES);
    expect(parseReleasedLanguages('  ')).toEqual(LANGUAGE_CODES);
  });

  it('liest die Liste in der Reihenfolge von LANGUAGE_CODES und überspringt Unbekanntes', () => {
    expect(parseReleasedLanguages('de, es,en ,th,xx')).toEqual(['th', 'en', 'es', 'de']);
  });

  it('ein Tippfehler ergibt keinen Build ohne Lernsprache', () => {
    expect(parseReleasedLanguages('deutsch')).toEqual(LANGUAGE_CODES);
  });

  it('der Store-Build zeigt nur die Sprachen mit veröffentlichtem Paket', () => {
    const eas = JSON.parse(readFileSync(join(__dirname, '../../../eas.json'), 'utf8'));
    expect(parseReleasedLanguages(eas.build.production.env.EXPO_PUBLIC_LERNSPRACHEN)).toEqual(['th', 'en', 'es', 'de']);
  });

  it('Lernziele im Store-Build: die neuen Sprachen fehlen, die App-Sprache bleibt ausgeblendet', () => {
    const vorher = process.env.EXPO_PUBLIC_LERNSPRACHEN;
    process.env.EXPO_PUBLIC_LERNSPRACHEN = 'th,en,es,de';
    try {
      jest.isolateModules(() => {
        const { zieleFuerBruecke } = require('./goals') as typeof import('./goals');
        expect(zieleFuerBruecke('de').map((ziel) => ziel.language)).toEqual(['th', 'en', 'es']);
        expect(zieleFuerBruecke('th').map((ziel) => ziel.language)).toEqual(['en', 'es', 'de']);
        // App-Sprachen bleiben App-Sprachen, auch wenn sie als Lernziel fehlen.
        expect(zieleFuerBruecke('ja').map((ziel) => ziel.language)).toEqual(['th', 'en', 'es', 'de']);
        expect(zieleFuerBruecke('ar').map((ziel) => ziel.language)).toEqual(['de', 'th', 'en', 'es']);
      });
    } finally {
      if (vorher === undefined) delete process.env.EXPO_PUBLIC_LERNSPRACHEN;
      else process.env.EXPO_PUBLIC_LERNSPRACHEN = vorher;
    }
  });
});
