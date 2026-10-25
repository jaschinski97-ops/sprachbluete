import { abgelehntZeile, ladeLetztenLauf, merkeLetztenLauf } from './last-run';

describe('Letzter Studio-Lauf', () => {
  beforeEach(() => {
    const speicher = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => speicher.get(k) ?? null, setItem: (k: string, v: string) => { speicher.set(k, v); } },
    });
  });
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it('übersteht ein Neuladen über den localStorage', () => {
    expect(ladeLetztenLauf()).toBeNull();
    merkeLetztenLauf('1172 automatisch übernommen', 42);
    expect(ladeLetztenLauf()).toEqual({ text: '1172 automatisch übernommen', at: 42 });
  });

  it('fasst abgelehnte Einträge kurz zusammen', () => {
    expect(abgelehntZeile([])).toBeNull();
    const viele = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, reason: 'Ton' }));
    const zeile = abgelehntZeile(viele)!;
    expect(zeile).toMatch(/^7 von der Helper-Prüfung abgelehnt/);
    expect(zeile).toContain('c4: Ton');
    expect(zeile).not.toContain('c5');
    expect(zeile.endsWith(' …')).toBe(true);
  });
});
