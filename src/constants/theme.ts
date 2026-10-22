/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Palette „Kirschblüte · Tag“ (23.10.2026): heller Frühlingshimmel, Karten
    // als weißes Glas, Schrift in dunklem Pflaumenton statt Schwarz.
    text: '#2A0F1F',
    background: '#FFF6F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FCE4EE',
    textSecondary: '#6B4459',
    // Semantische Tokens (UI-Review 2026-09-07). Bis hierher kannte das Theme
    // nur Grautöne und die fünf Tonfarben — jede aussagekräftige Farbe war
    // woanders hart codiert (z. B. #3c87f7 für Links, ohne Dunkelmodus-Fassung).
    // Wie bei den Tonfarben (AE-24) gilt: Werte je Modus, AA nachgerechnet in
    // `tones.test.ts`.
    /** Fläche der jeweils wichtigsten Aktion (gefüllter Knopf). */
    accent: '#0F766E',
    /** Schrift auf der Akzentfläche. */
    accentText: '#ffffff',
    /** Textlinks — gedecktes Blau in der Richtung der alten #3c87f7, aber AA-tauglich. */
    link: '#A3164F',
    /** „Richtig" — bewusst ein gesättigtes Grün, nicht die matte Tonfarbe „mittel". */
    success: '#14602f',
    /** „Falsch" — bewusst ein Purpurrot, nicht das terracotta-farbene „fallend". */
    error: '#9c1c3a',
    /** Warnkennzeichen für unbelegte Bedeutungen (früher hart codiertes #AE8B3F). */
    badge: '#6b4e0d',
    /** Dezente Steuerkannte (Knopf-Rahmen, gestrichelte Leer-Rahmen). */
    borderSubtle: '#9A6F84',
    /** Rein dekorative Flächen (Punktmuster, Fortschritts-Schiene) — kein AA-Maß. */
    decorGrey: '#E9C6D6',
    /**
     * Bewertungsknöpfe (Nochmal/Schwer/Gut/Leicht) als Farbpaar je Stufe:
     * getönte Fläche + kräftige Schrift. Vorher waren alle vier Knöpfe dieselbe
     * Graufläche — die häufigste Handlung der App verlangte beim Lesen mehr
     * Zeit, als sie durfte. Die Werte sind als Paar gerechnet: jede Schrift
     * erreicht auf ihrer eigenen Fläche 4,5:1 (Nachweis in
     * `rating-colors.test.ts`), einzeln eingesetzt gelten sie nicht.
     */
    rateAgainBg: '#F7E7EA',
    rateAgainText: '#9c1c3a',
    rateHardBg: '#F5EDDC',
    rateHardText: '#6b4e0d',
    rateGoodBg: '#E6EFE7',
    rateGoodText: '#14602f',
    rateEasyBg: '#FCE4EE',
    rateEasyText: '#A3164F',
    /**
     * Effekt-Tokens (22.10.2026) — rein dekorativ, tragen keinen Text:
     * Kartenkante und der Verlauf der Hauptknöpfe (Schrift darauf:
     * `gradientText`, AA gegen beide Enden in `tones.test.ts`). `glass` ist
     * die halbdurchsichtige Kartenfläche über der Kirschblüten-Szene.
     */
    cardBorder: 'rgba(236,72,153,0.22)',
    glass: 'rgba(255,255,255,0.74)',
    // Jade (翡翠) statt Pink seit 23.10.2026 (Nutzerwunsch): ergänzt das Rosa
    // der Blüten und das Petrol des Nachthimmels.
    gradientStart: '#99F6E4',
    gradientEnd: '#2DD4BF',
    gradientText: '#042F2E',
    /**
     * Kirschblüten-Szene (`SakuraBackground`): Himmel von oben nach unten,
     * Lichtschein (Tag: Sonne, Nacht: Mond), Blütenfarben, Zweig, Blatt.
     * Rein dekorativ, kein Text darauf.
     */
    skyTop: '#B9DDFB',
    skyMid: '#E4F0FD',
    skyBottom: '#FFF0F5',
    skyGlow: '#FFF6D8',
    blossom: '#FFD3E6',
    blossomEdge: '#F49CC4',
    blossomCore: '#E0558F',
    branch: '#6B4A4F',
    petal: '#FFC2DB',
  },
  dark: {
    // Palette „Kirschblüte · Nacht“ (23.10.2026): Anime-Nachthimmel in
    // Blau und Petrol mit Mondschein, Karten als dunkles Glas.
    text: '#FFF6FA',
    background: '#0B1628',
    backgroundElement: '#142240',
    backgroundSelected: '#1D2C4D',
    textSecondary: '#E2C6D5',
    accent: '#5EEAD4',
    accentText: '#042F2E',
    link: '#FFB3D3',
    success: '#86c998',
    error: '#f2a8b6',
    badge: '#d8ba7c',
    borderSubtle: '#A88AA0',
    decorGrey: '#3A3550',
    /**
     * Bewertungsknöpfe im Dunkelmodus (Paare mit den hellen Werten; siehe den
     * Kommentar dort): tiefe Töne der Fläche, helle Schrift daraus.
     */
    rateAgainBg: '#3A1A2E',
    rateAgainText: '#f2a8b6',
    rateHardBg: '#332A14',
    rateHardText: '#d8ba7c',
    rateGoodBg: '#14291A',
    rateGoodText: '#86c998',
    rateEasyBg: '#3A1830',
    rateEasyText: '#FFB3D3',
    cardBorder: 'rgba(255,183,213,0.34)',
    glass: 'rgba(16,26,52,0.58)',
    gradientStart: '#99F6E4',
    gradientEnd: '#2DD4BF',
    gradientText: '#042F2E',
    skyTop: '#13223D',
    skyMid: '#1F4060',
    skyBottom: '#0B1628',
    skyGlow: '#CDEFFF',
    blossom: '#FFD3E6',
    blossomEdge: '#F49CC4',
    blossomCore: '#E0558F',
    branch: '#2A1A22',
    petal: '#FFC6DE',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
