import { cardKey } from '../fsrs/types';

import { bridgeText } from './bridge';
import {
  isPairId,
  pairId,
  PairId,
  pairsFor,
  parsePairId,
  PAIRS,
  SUPPORTED_TARGETS,
} from './types';

/**
 * Die Paarmatrix (Roadmap v2, „Richtungslogik“).
 *
 * DREI AUSSAGEN TRAGEN DIESE DATEI:
 *
 * 1. **Der Kanon ist vollständig, aber ohne Selbstpaare.** 4 × 3 = 12 Paare,
 *    jede Richtung genau einmal (Kern 4 seit 09.09.2026 — Französisch entfernt).
 * 2. **Die sechs klassischen Richtungen bleiben wörtlich gültig.** Sie sind
 *    Paar-IDs, `pairsFor('de')` liefert sie unverändert, und gespeicherte
 *    Kartenschlüssel im Format `vocabId:de_to_th` sind davon unberührt.
 * 3. **Brückentexte fallen ehrlich zurück.** `bridgeText` sagt über
 *    `usedFallback`, wenn die gewünschte Sprache fehlt.
 */

describe('Die Paarmatrix', () => {
  it('führt genau 12 Paare — 4 Zielsprachen, keine Selbstpaare', () => {
    // Seit dem Sprach-Umbau dieselbe Liste wie LANGUAGE_CODES (Reihenfolge der App).
    expect(SUPPORTED_TARGETS).toEqual(['th', 'en', 'es', 'de']);
    expect(PAIRS).toHaveLength(4 * 3);
    for (const pair of PAIRS) {
      expect(pair.source).not.toBe(pair.target);
    }
  });

  it('trägt jede Paar-ID genau einmal', () => {
    const ids = PAIRS.map(pairId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]{2}_to_[a-z]{2}$/);
    }
  });

  it('schließt Selbstpaare aus — im Typ und zur Laufzeit', () => {
    expect(parsePairId('de_to_de')).toBeNull();
    expect(isPairId('de_to_de')).toBe(false);
    expect(isPairId('xx_to_yy')).toBe(false);
    expect(isPairId('de')).toBe(false);
  });

  it('rundet Paar und ID ineinander', () => {
    for (const pair of PAIRS) {
      expect(parsePairId(pairId(pair))).toEqual(pair);
      expect(isPairId(pairId(pair))).toBe(true);
    }
  });

  it('liefert pairsFor alle Paare einer Brückensprache und nur solche', () => {
    for (const bridge of SUPPORTED_TARGETS) {
      const pairs = pairsFor(bridge);
      expect(pairs).toHaveLength(3);
      for (const pair of pairs) {
        expect(pair.source).toBe(bridge);
        expect(pair.target).not.toBe(bridge);
      }
    }
    // Deutsch als Brücke: die drei klassischen Richtungen.
    expect(pairsFor('de').map(pairId)).toEqual([
      'de_to_th',
      'de_to_en',
      'de_to_es',
    ]);
  });
});

describe('Die sechs klassischen Richtungen bleiben unverändert (Kompatibilität)', () => {
  // COMPILE-ZEUGNIS: Diese Zuweisung kompiliert nur, wenn alle sechs alten
  // Richtungswerte gültige PairIds sind — der Grund, warum kein
  // gespeicherter Kartenschlüssel (`vocabId:de_to_th`) angefasst werden
  // musste.
  const legacy: PairId[] = [
    'de_to_th',
    'th_to_de',
    'de_to_en',
    'en_to_de',
    'de_to_es',
    'es_to_de',
  ];
  expect(legacy).toHaveLength(6);

  it.each([
    'de_to_th',
    'th_to_de',
    'de_to_en',
    'en_to_de',
    'de_to_es',
    'es_to_de',
  ] as const)('%s ist eine gültige Paar-ID mit stabilem Format', (id) => {
    expect(isPairId(id)).toBe(true);
    const pair = parsePairId(id)!;
    expect(pairId(pair)).toBe(id);
    expect(PAIRS.map(pairId)).toContain(id);
  });

  it('passt auf bestehende Kartenschlüssel, ohne sie anzufassen', () => {
    // Dass 'de_to_th' hier ohne Cast durchgeht, ist die eigentliche Aussage:
    // der Bestandstyp Direction und die Paar-IDs teilen dieselben Literale.
    expect(cardKey('sawatdii', 'de_to_th')).toBe('sawatdii:de_to_th');
    expect(cardKey('es_medico', 'es_to_de')).toBe('es_medico:es_to_de');
  });
});

describe('Der Brückentext fällt ehrlich zurück', () => {
  const eintrag = {
    german: 'das Haus',
    term: 'la maison',
    translations: { en: 'house', es: 'casa' },
  };

  it('liefert den Brückentext, wenn die Sprache gedeckt ist', () => {
    expect(bridgeText(eintrag, 'en')).toEqual({ text: 'house', usedFallback: false });
    expect(bridgeText(eintrag, 'es')).toEqual({ text: 'casa', usedFallback: false });
  });

  it('fällt auf Englisch zurück — nicht auf Deutsch — und sagt es', () => {
    // Thai ist nicht übersetzt — der Fallback greift und wird gekennzeichnet.
    // Seit 26.09. Englisch vor Deutsch: Eine thailändische Oberfläche sah
    // sonst deutsche Worterklärungen.
    expect(bridgeText(eintrag, 'th')).toEqual({ text: 'house', usedFallback: true });
    expect(bridgeText({ german: 'das Haus', term: 'la maison' }, 'th')).toEqual({ text: 'das Haus', usedFallback: true });
  });

  it('fällt bei Deutsch sinnvollerweise auf Deutsch — als gekennzeichneter Fallback', () => {
    // Deutsch IST der Quelltext; das Feld translations.de soll niemand pflegen.
    expect(bridgeText(eintrag, 'de')).toEqual({ text: 'das Haus', usedFallback: true });
  });

  it('trägt die Kette weiter, wenn nicht einmal Deutsch da ist', () => {
    const ohneDeutsch = { german: '', term: 'la maison', translations: { en: 'house' } };
    const nackter = { german: '', term: 'maison' };
    expect(bridgeText(nackter, 'en')).toEqual({ text: 'maison', usedFallback: true });
    expect(bridgeText({ german: '' }, 'en')).toEqual({ text: '', usedFallback: true });
  });
});

