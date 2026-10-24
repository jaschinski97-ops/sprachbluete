import type { F0Frame } from '../speaking/analysis';
import { richteSilbenAus } from './silben-ausrichtung';
import { silbenbauFolge } from './silbenbau';

/** Stimmhafter Zug ab Fenster `ab` mit `n` Fenstern; `taeler` senken die Energie. */
function zug(ab: number, n: number, taeler: number[] = []): F0Frame[] {
  return Array.from({ length: n }, (_, i) => ({
    t: (ab + i) / 100, start: 0, f0: 200, rms: taeler.includes(i) ? 0.1 : 1, correlation: 0.9,
  }));
}

describe('Silben-Ausrichtung', () => {
  it('nimmt eindeutige Lücken als gemessene Grenzen', () => {
    const ergebnis = richteSilbenAus([zug(0, 20), zug(30, 20)], 2, null)!;
    expect(ergebnis.segmente.map((s) => s.length)).toEqual([20, 20]);
    expect(ergebnis.grenzen).toEqual([expect.objectContaining({ gemessen: true, fuge: 'luecke' })]);
  });

  it('trennt einen Zug am Energietal, aber nur als geratene Grenze', () => {
    const ergebnis = richteSilbenAus([zug(0, 40, [19, 20])], 2, null)!;
    expect(ergebnis.segmente).toHaveLength(2);
    expect(ergebnis.grenzen[0]).toMatchObject({ gemessen: false, fuge: 'tal' });
  });

  it('verschmilzt eine kurze Lücke in einer Silbe, wenn der Silbenbau dort keine Grenze erwartet', () => {
    // mɛ̂ɛ-náam: sonorer Anlaut, keine Lücke erwartet; khâo: stimmlos.
    const bau = silbenbauFolge(['khâo', 'mɛ̂ɛ', 'náam']);
    const zuege = [zug(0, 18), zug(26, 8), zug(36, 10), zug(48, 20)];
    const ergebnis = richteSilbenAus(zuege, 3, bau)!;
    expect(ergebnis.segmente).toHaveLength(3);
    expect(ergebnis.segmente[0].length).toBe(18);
  });

  it('liefert null, wenn weniger Stücke als Silben da sind', () => {
    expect(richteSilbenAus([zug(0, 6)], 3, null)).toBeNull();
    expect(richteSilbenAus([], 2, null)).toBeNull();
  });
});
