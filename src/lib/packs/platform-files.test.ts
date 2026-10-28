/**
 * Wächter gegen Plattform-Namensfallen (28.10.2026).
 *
 * Metro nimmt auf iOS/Android `X.native.ts` statt `X.ts`, sobald es beide
 * gibt; Jest nimmt `X.ts`. Der Sprachpaket-Entpacker lag als
 * `extractor.native.ts` neben `extractor.ts` und exportierte etwas anderes —
 * im Test grün, auf dem iPhone „undefined is not a function“. Dieser Test
 * verlangt, dass solche Paare dieselben Namen exportieren.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function alleDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? alleDateien(pfad) : [pfad];
  });
}

function exporte(datei: string): string[] {
  const text = readFileSync(datei, 'utf8');
  const namen = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+(\w+)/g)].map(
    (treffer) => treffer[1]
  );
  if (/export\s+default/.test(text)) namen.push('default');
  return namen.sort();
}

describe('Plattform-Dateipaare', () => {
  const paare = alleDateien(SRC)
    .filter((datei) => /\.native\.tsx?$/.test(datei))
    .flatMap((nativ) => {
      const basis = ['.ts', '.tsx'].map((endung) => nativ.replace(/\.native\.tsx?$/, endung));
      return basis.filter((datei) => {
        try {
          return statSync(datei).isFile();
        } catch {
          return false;
        }
      }).map((datei) => [nativ, datei] as const);
    });

  it('der Entpacker hat keine .native-Datei mehr neben extractor.ts', () => {
    expect(paare.map(([nativ]) => nativ).some((datei) => datei.endsWith('extractor.native.ts'))).toBe(false);
  });

  it('jedes .native-Paar exportiert dieselben Namen wie die Basisdatei', () => {
    for (const [nativ, basis] of paare) {
      expect({ datei: nativ.slice(SRC.length + 1), namen: exporte(nativ) }).toEqual({
        datei: nativ.slice(SRC.length + 1),
        namen: exporte(basis),
      });
    }
  });
});
