import { erwarteteDauer, grenzArt, silbenbau, silbenbauFolge } from './silbenbau';

describe('Silbenbau aus der Umschrift', () => {
  it('liest Anlaut, Vokallänge und Auslaut', () => {
    expect(silbenbau('khâo')).toEqual({ anlaut: 'stimmlos', lang: false, auslaut: 'sonor', tot: false });
    expect(silbenbau('thɛ̌ɛo')).toMatchObject({ anlaut: 'stimmlos', lang: true, auslaut: 'sonor' });
    expect(silbenbau('rót')).toEqual({ anlaut: 'stimmhaft', lang: false, auslaut: 'verschluss', tot: true });
    expect(silbenbau('gà')).toEqual({ anlaut: 'stimmlos', lang: false, auslaut: 'offen', tot: true });
    expect(silbenbau('naa')).toEqual({ anlaut: 'stimmhaft', lang: true, auslaut: 'offen', tot: false });
    expect(silbenbau('èet')).toMatchObject({ anlaut: 'vokal', lang: true, tot: true });
    expect(silbenbau('bplaa')).toMatchObject({ anlaut: 'stimmlos', lang: true });
    expect(silbenbau('phʉ̂a')).toMatchObject({ anlaut: 'stimmlos', lang: true, auslaut: 'offen' });
  });

  it('liefert null statt zu raten', () => {
    expect(silbenbau('—')).toBeNull();
    expect(silbenbau('xaa')).toBeNull();
    expect(silbenbauFolge(['khâo', '—'])).toBeNull();
    expect(silbenbauFolge(['gà', 'rú', 'naa'])).toHaveLength(3);
  });

  it('erwartet Lücken vor stimmlosem Anlaut und nach Verschluss', () => {
    const [ga, ru, naa] = silbenbauFolge(['gà', 'rú', 'naa'])!;
    const [khao, thaeo] = silbenbauFolge(['khâo', 'thɛ̌ɛo'])!;
    const [rot, fai] = silbenbauFolge(['rót', 'fai'])!;
    const [mae, naam] = silbenbauFolge(['mɛ̂ɛ', 'náam'])!;
    expect(grenzArt(khao, thaeo)).toBe('luecke');
    expect(grenzArt(rot, fai)).toBe('luecke');
    expect(grenzArt(ga, ru)).toBe('vielleicht');
    expect(grenzArt(ru, naa)).toBe('vielleicht');
    expect(grenzArt(mae, naam)).toBe('fliessend');
  });

  it('gewichtet lange lebende Silben länger als kurze tote', () => {
    expect(erwarteteDauer(silbenbau('naa')!, false)).toBeGreaterThan(erwarteteDauer(silbenbau('rót')!, false));
    expect(erwarteteDauer(silbenbau('naa')!, true)).toBeGreaterThan(erwarteteDauer(silbenbau('naa')!, false));
  });
});
