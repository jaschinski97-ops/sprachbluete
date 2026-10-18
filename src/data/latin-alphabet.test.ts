import { ALPHABET_SOURCES, isSpellable, LATIN_ALPHABETS, spellOut } from './latin-alphabet';

describe('Kapitel 0: das lateinische ABC', () => {
  it('hat die Buchstabenzahl der Quellen: 26 englisch, 27 spanisch (ñ), 30 deutsch (ä ö ü ß)', () => {
    expect(LATIN_ALPHABETS.en).toHaveLength(26);
    expect(LATIN_ALPHABETS.es).toHaveLength(27);
    expect(LATIN_ALPHABETS.de).toHaveLength(30);
    for (const source of Object.values(ALPHABET_SOURCES)) expect(source.retrieved).toBe('2026-10-18');
  });

  it('führt jeden Buchstaben mit Lautschrift und einem sprechbaren Text', () => {
    for (const letters of Object.values(LATIN_ALPHABETS)) {
      for (const letter of letters) {
        expect(letter.ipa).toMatch(/^\/.+\/$/);
        expect(letter.spoken.length).toBeGreaterThan(0);
      }
      expect(new Set(letters.map((letter) => letter.lower)).size).toBe(letters.length);
    }
  });

  it('nennt die Namen der Quellen (ASALE, OED, Duden-Auswahl)', () => {
    const name = (language: keyof typeof LATIN_ALPHABETS, upper: string) =>
      LATIN_ALPHABETS[language].find((letter) => letter.upper === upper)?.name;
    expect(['H', 'W', 'Y', 'Z'].map((upper) => name('en', upper))).toEqual(['aitch', 'double-u', 'wy', 'zed']);
    expect(['H', 'Ñ', 'V', 'W', 'Y'].map((upper) => name('es', upper))).toEqual(['hache', 'eñe', 'uve', 'uve doble', 'ye']);
    expect(['J', 'Y', 'Z', 'ẞ', 'B'].map((upper) => name('de', upper))).toEqual(['Jot', 'Ypsilon', 'Zett', 'Eszett', null]);
  });

  it('buchstabiert Wörter mit Sonderbuchstaben und lehnt Akzente und Leerzeichen ab', () => {
    expect(spellOut('de', 'Straße').map((letter) => letter.upper).join('')).toBe('STRAẞE');
    expect(spellOut('es', 'niño').map((letter) => letter.name)).toEqual(['ene', 'i', 'eñe', 'o']);
    expect(isSpellable('es', 'café')).toBe(false);
    expect(isSpellable('en', 'ice cream')).toBe(false);
    expect(() => spellOut('en', 'é')).toThrow(RangeError);
  });
});
