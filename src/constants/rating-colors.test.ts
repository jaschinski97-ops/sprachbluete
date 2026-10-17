import { Colors } from './theme';
import { kontrastVerhaeltnis } from './tones.test';

/**
 * Kontrast der Bewertungsknöpfe (WCAG 2.1 AA) — gerechnet, nicht geschätzt.
 *
 * Die vier Stufen (Nochmal/Schwer/Gut/Leicht) stehen als getönte Fläche mit
 * kräftiger Schrift. Beide Farben eines Paars leben im Theme nebeneinander und
 * werden zusammen eingesetzt (`ratingBg` + `ratingText` im Lernen-Reiter); der
 * Test rechnet jedes Paar gegen seine eigene Fläche nach. Grenzwert: 4,5:1 —
 * die Beschriftung ist Text, also gilt der strenge Wert wie bei den Tonfarben.
 *
 * WARUM ALS TEST: Die Tints sind bewusst flach gewählt (sie sollen die Stufe
 * kennzeichnen, nicht als Fläche konkurrenzieren). Wer später an einer Farbe
 * dreht, merkt hier sofort, wenn das Paar auseinanderfällt.
 */

const PAARE: [keyof typeof Colors.light, keyof typeof Colors.light][] = [
  ['rateAgainText', 'rateAgainBg'],
  ['rateHardText', 'rateHardBg'],
  ['rateGoodText', 'rateGoodBg'],
  ['rateEasyText', 'rateEasyBg'],
];

const MODI = ['light', 'dark'] as const;

describe('Kontrast der Bewertungsknöpfe (WCAG 2.1 AA)', () => {
  it.each(MODI)('erreicht im Modus %s je Paar mindestens 4,5:1', (modus) => {
    const farben = Colors[modus];
    for (const [text, flaeche] of PAARE) {
      expect(kontrastVerhaeltnis(farben[text], farben[flaeche])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
