import { Colors } from './theme';
import { ColorScheme, Tone, TONE_KEYS, toneColor, TONES } from './tones';

/**
 * Kontrastprüfung nach WCAG 2.1 — gerechnet, nicht geschätzt.
 *
 * WARUM ALS TEST UND NICHT ALS EINMALIGE MESSUNG: Farben werden im Vorbeigehen
 * geändert. Eine Tabelle im Protokoll altert dann still, und niemand merkt es,
 * bis sich jemand beschwert, dass er die Umschrift nicht lesen kann. Als Test
 * fällt jede Änderung sofort auf.
 *
 * Die Formeln stehen hier ausgeschrieben statt aus einer Bibliothek zu kommen:
 * es sind zehn Zeilen, sie sind in der Norm nachlesbar, und eine Abhängigkeit
 * mehr im Projekt wäre der schlechtere Tausch.
 *
 * Grenzwerte (WCAG 2.1 AA):
 *   1.4.3 Kontrast (Minimum)     — 4,5:1 für normalen Text
 *   1.4.11 Nicht-Text-Kontrast   — 3:1 für grafische Objekte und Bedienelemente
 *
 * Die Tonfarben werden als **Text** verwendet (die Silben der Umschrift in
 * `ThaiWord`, die Beschriftung in `ToneLegend`) — für sie gilt also 4,5:1, der
 * strengere Wert. Dass sie zusätzlich als Konturglyphe und als Rahmen
 * auftauchen, ist damit mit abgedeckt.
 */

function kanal(wert: number): number {
  const c = wert / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative Leuchtdichte nach WCAG 2.1, Definition „relative luminance". */
export function relativeLeuchtdichte(hex: string): number {
  const wert = hex.replace('#', '');
  const r = parseInt(wert.slice(0, 2), 16);
  const g = parseInt(wert.slice(2, 4), 16);
  const b = parseInt(wert.slice(4, 6), 16);
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** Kontrastverhältnis nach WCAG 2.1: (L_hell + 0,05) / (L_dunkel + 0,05). */
export function kontrastVerhaeltnis(vorne: string, hinten: string): number {
  const a = relativeLeuchtdichte(vorne);
  const b = relativeLeuchtdichte(hinten);
  const [hell, dunkel] = a > b ? [a, b] : [b, a];
  return (hell + 0.05) / (dunkel + 0.05);
}

const AA_TEXT = 4.5;
const AA_GRAFIK = 3;

/** Alle Untergründe, auf denen Text tatsächlich landet. */
const UNTERGRUENDE: Record<ColorScheme, string[]> = {
  light: [Colors.light.background, Colors.light.backgroundElement, Colors.light.backgroundSelected],
  dark: [Colors.dark.background, Colors.dark.backgroundElement, Colors.dark.backgroundSelected],
};

const MODI: ColorScheme[] = ['light', 'dark'];

describe('Kontrast der Tonfarben (WCAG 2.1 AA)', () => {
  it('rechnet die Norm-Beispiele richtig', () => {
    // Schwarz auf Weiss ist per Definition 21:1, Gleiches auf Gleichem 1:1.
    expect(kontrastVerhaeltnis('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(kontrastVerhaeltnis('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Ein bekannter Zwischenwert: mittleres Grau gegen Weiss.
    expect(kontrastVerhaeltnis('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(kontrastVerhaeltnis('#777777', '#ffffff')).toBeLessThan(4.6);
  });

  it.each(MODI)('erreicht im Modus %s auf jedem Untergrund mindestens 4,5:1', (modus) => {
    for (const ton of TONE_KEYS) {
      for (const grund of UNTERGRUENDE[modus]) {
        const verhaeltnis = kontrastVerhaeltnis(toneColor(ton, modus), grund);
        expect({
          ton,
          modus,
          grund,
          verhaeltnis: Number(verhaeltnis.toFixed(2)),
        }).toEqual({
          ton,
          modus,
          grund,
          verhaeltnis: expect.any(Number),
        });
        expect(verhaeltnis).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it('erfüllt als Konturglyphe auch die Nicht-Text-Grenze', () => {
    // Ergibt sich aus 4,5, wird aber eigens geprueft: die Kontur traegt die
    // Toninformation fuer alle, die Farben schlecht unterscheiden.
    for (const modus of MODI) {
      for (const ton of TONE_KEYS) {
        for (const grund of UNTERGRUENDE[modus]) {
          expect(kontrastVerhaeltnis(toneColor(ton, modus), grund)).toBeGreaterThanOrEqual(
            AA_GRAFIK
          );
        }
      }
    }
  });

  it('hält die fünf Töne auch untereinander unterscheidbar', () => {
    // Zwei Toene mit fast gleicher Farbe waeren zwar lesbar, aber nutzlos.
    for (const modus of MODI) {
      const gesehen: { ton: Tone; hex: string }[] = [];
      for (const ton of TONE_KEYS) {
        const hex = toneColor(ton, modus);
        for (const anderer of gesehen) {
          expect(hex).not.toBe(anderer.hex);
        }
        gesehen.push({ ton, hex });
      }
    }
  });

  it('behält je Ton denselben Farbton in beiden Modi', () => {
    // Die helle und die dunkle Fassung duerfen sich in der Helligkeit
    // unterscheiden, nicht in der Farbe - sonst waere "tief" im Dunkelmodus
    // ploetzlich gruen und die Legende im Kopf waere hinfaellig.
    for (const ton of TONE_KEYS) {
      expect(farbwinkel(toneColor(ton, 'light'))).toBeCloseTo(
        farbwinkel(toneColor(ton, 'dark')),
        0
      );
    }
  });

  it('gibt je Ton eine Farbe für beide Modi heraus', () => {
    for (const ton of TONE_KEYS) {
      expect(TONES[ton].colors.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(TONES[ton].colors.dark).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('Kontrast der Grundfarben (WCAG 2.1 AA)', () => {
  it.each(MODI)('liest sich im Modus %s auf jedem Untergrund', (modus) => {
    for (const grund of UNTERGRUENDE[modus]) {
      expect(kontrastVerhaeltnis(Colors[modus].text, grund)).toBeGreaterThanOrEqual(AA_TEXT);
      // textSecondary traegt Hinweise und Erklaerungen - also echter Text,
      // nicht Dekoration. Derselbe Grenzwert.
      expect(kontrastVerhaeltnis(Colors[modus].textSecondary, grund)).toBeGreaterThanOrEqual(
        AA_TEXT
      );
    }
  });
});

/**
 * Kontrast der semantischen Tokens (UI-Review 2026-09-07).
 *
 * Die Token ersetzen hart codierte Farben (#3c87f7, #AE8B3F, #888888, …) und
 * die Zweckentfremdung von Tonfarben für Richtig/Falsch. Damit sie das halten
 * dürfen, was sie versprechen, rechnet dieser Block dieselben Grenzwerte nach:
 *
 *   link, success, error, badge — Text (4,5:1 je Modus und Untergrund)
 *   accent, borderSubtle       — Fläche/Kante, also Nicht-Text (3:1)
 *   accentText auf accent      — Knopfbeschriftung, also Text (4,5:1)
 *
 * `decorGrey` fehlt bewusst: Es füllt rein dekorative Flächen (Punktreihen,
 * Fortschritts-Schienen), für die WCAG kein Maß verlangt — ein Grenzwert hier
 * würde es zwingen, lauter zu sein, als sein Zweck es will.
 */
describe('Kontrast der semantischen Farben (WCAG 2.1 AA)', () => {
  const TEXT_TOKENS = ['link', 'success', 'error', 'badge'] as const;

  it.each(MODI)('liest sich im Modus %s auf jedem Untergrund', (modus) => {
    for (const token of TEXT_TOKENS) {
      for (const grund of UNTERGRUENDE[modus]) {
        expect(kontrastVerhaeltnis(Colors[modus][token], grund)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it.each(MODI)(' hebt sich als Fläche im Modus %s von jedem Untergrund ab', (modus) => {
    // 1.4.11: Ein gefüllter Akzent-Knopf muss als Fläche erkennbar bleiben,
    // auch wenn er auf einer der Karten-Hintergründe liegt.
    for (const grund of UNTERGRUENDE[modus]) {
      expect(kontrastVerhaeltnis(Colors[modus].accent, grund)).toBeGreaterThanOrEqual(AA_GRAFIK);
    }
  });

  it.each(MODI)('beschriftet die Akzentfläche im Modus %s lesbar', (modus) => {
    expect(kontrastVerhaeltnis(Colors[modus].accentText, Colors[modus].accent)).toBeGreaterThanOrEqual(
      AA_TEXT
    );
  });

  it.each(MODI)(' grenzt borderSubtle im Modus %s gegen jeden Untergrund ab', (modus) => {
    // Steuerkannten müssen sichtbar sein (3:1), sonst ist der Knopf nur noch
    // eine Vermutung — besonders im Dunkelmodus, wo #888888 bisher keine
    // eigene Fassung hatte.
    for (const grund of UNTERGRUENDE[modus]) {
      expect(kontrastVerhaeltnis(Colors[modus].borderSubtle, grund)).toBeGreaterThanOrEqual(
        AA_GRAFIK
      );
    }
  });

  it.each(MODI)('beschriftet den Knopf-Verlauf im Modus %s an beiden Enden lesbar', (modus) => {
    // 22.10.2026: Hauptknöpfe tragen einen Verlauf statt einer Fläche — die
    // Schrift muss an JEDER Stelle 4,5:1 halten, also an beiden Enden.
    for (const ende of [Colors[modus].gradientStart, Colors[modus].gradientEnd]) {
      expect(kontrastVerhaeltnis(Colors[modus].gradientText, ende)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('koppelt Richtig/Falsch von den Tonfarben ab', () => {
    // BISHER KODIERTEN „Richtig" und „Falsch" MITTEL und FALLEND - dieselben
    // Farben, die Thai-Töne bedeuten. Wer Tonerkennung übt, bekam damit zwei
    // Alphabete im einen. success und error müssen von ALLEN fünf Tonfarben
    // deutlich verschieden sein: anderer Hexwert genügt nicht, auch der
    // Farbton muss Abstand halten (≥ 20°, über die 360°-Grenze gerechnet).
    for (const modus of MODI) {
      for (const token of ['success', 'error'] as const) {
        for (const ton of TONE_KEYS) {
          expect(Colors[modus][token]).not.toBe(toneColor(ton, modus));
          expect(hueAbstand(Colors[modus][token], toneColor(ton, modus))).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });
});

/** Farbwinkel exakt in Grad — Grundlage für den Hue-Abstand. */
function farbwinkelExakt(hex: string): number {
  const wert = hex.replace('#', '');
  const r = parseInt(wert.slice(0, 2), 16) / 255;
  const g = parseInt(wert.slice(2, 4), 16) / 255;
  const b = parseInt(wert.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

/** Hue-Abstand in Grad, kürzerer Weg über die 360°-Grenze. */
function hueAbstand(a: string, b: string): number {
  const diff = Math.abs(farbwinkelExakt(a) - farbwinkelExakt(b));
  return Math.min(diff, 360 - diff);
}

/** Farbwinkel in Grad — nur für die Prüfung, ob der Farbton erhalten bleibt. */
function farbwinkel(hex: string): number {
  // Auf zehn Grad gerundet: die Loesung der Helligkeit verschiebt den Winkel
  // minimal, ein Farbwechsel waere dagegen ein Sprung.
  return Math.round(farbwinkelExakt(hex) / 10);
}
