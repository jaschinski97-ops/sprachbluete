/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Palette „Nachtflug“ (22.10.2026): kühles Weiß mit violettem Stich statt
    // reinem Grau; Karten heben sich als reines Weiß ab.
    text: '#0B0B1F',
    background: '#F6F6FC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEBFA',
    textSecondary: '#555874',
    // Semantische Tokens (UI-Review 2026-09-07). Bis hierher kannte das Theme
    // nur Grautöne und die fünf Tonfarben — jede aussagekräftige Farbe war
    // woanders hart codiert (z. B. #3c87f7 für Links, ohne Dunkelmodus-Fassung).
    // Wie bei den Tonfarben (AE-24) gilt: Werte je Modus, AA nachgerechnet in
    // `tones.test.ts`.
    /** Fläche der jeweils wichtigsten Aktion (gefüllter Knopf). */
    accent: '#5B34D6',
    /** Schrift auf der Akzentfläche. */
    accentText: '#ffffff',
    /** Textlinks — gedecktes Blau in der Richtung der alten #3c87f7, aber AA-tauglich. */
    link: '#4A2BC2',
    /** „Richtig" — bewusst ein gesättigtes Grün, nicht die matte Tonfarbe „mittel". */
    success: '#14602f',
    /** „Falsch" — bewusst ein Purpurrot, nicht das terracotta-farbene „fallend". */
    error: '#9c1c3a',
    /** Warnkennzeichen für unbelegte Bedeutungen (früher hart codiertes #AE8B3F). */
    badge: '#6b4e0d',
    /** Dezente Steuerkannte (Knopf-Rahmen, gestrichelte Leer-Rahmen). */
    borderSubtle: '#7A7D99',
    /** Rein dekorative Flächen (Punktmuster, Fortschritts-Schiene) — kein AA-Maß. */
    decorGrey: '#B9BAD0',
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
    rateEasyBg: '#ECE8FB',
    rateEasyText: '#4A2BC2',
    /**
     * Effekt-Tokens (22.10.2026) — rein dekorativ, tragen keinen Text:
     * Kartenkante, die drei Aurora-Farben des Hintergrunds und der
     * Verlauf der Hauptknöpfe (Schrift darauf: `gradientText`, AA gegen
     * beide Enden in `tones.test.ts`). `glass` ist die halbdurchsichtige
     * Kartenfläche über der Aurora.
     */
    cardBorder: '#E3E2F2',
    glass: 'rgba(255,255,255,0.82)',
    glowA: '#C4B5FD',
    glowB: '#A5F3FC',
    glowC: '#FBCFE8',
    gradientStart: '#6D28D9',
    gradientEnd: '#0E7490',
    gradientText: '#FFFFFF',
  },
  dark: {
    // Palette „Nachtflug“ (22.10.2026): Tiefes Nachtblau mit Violettstich
    // statt Schwarz, darauf die Aurora (`AuroraBackground`).
    text: '#F4F4FF',
    background: '#07071A',
    backgroundElement: '#13132B',
    backgroundSelected: '#1E1E3D',
    textSecondary: '#B6B8D6',
    accent: '#A78BFA',
    accentText: '#170B3B',
    link: '#A9B8FF',
    success: '#86c998',
    error: '#f2a8b6',
    badge: '#d8ba7c',
    borderSubtle: '#8F92B8',
    decorGrey: '#3A3B5C',
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
    rateEasyBg: '#1E1840',
    rateEasyText: '#C4B5FD',
    cardBorder: '#26264A',
    glass: 'rgba(19,19,43,0.78)',
    glowA: '#6D4AFF',
    glowB: '#0EA5E9',
    glowC: '#DB2777',
    gradientStart: '#A78BFA',
    gradientEnd: '#67E8F9',
    gradientText: '#140A33',
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
