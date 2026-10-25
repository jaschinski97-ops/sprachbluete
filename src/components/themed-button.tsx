import { StyleSheet, View, type PressableProps } from 'react-native';

import { GradientFill, PressableScale } from './fx';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Beschriftung — sichtbar und (ohne eigenen Override) auch die Screenreader-Ansage. */
  label: string;
  /**
   * `primary` — Akzentfläche für den jeweils wichtigsten nächsten Schritt
   * (Aufdecken, Weiter, Aufnahme starten). `secondary` ist der bestehende
   * graue Chip für alles Übrige; so bleibt die Akzentfarbe eine Aussage
   * darüber, was als Nächstes zu tun ist, statt bloßer Schmuck.
   */
  variant?: 'primary' | 'secondary';
};

/**
 * Der gemeinsame Knopf (UI-Review 2026-09-07).
 *
 * Bis hierher rollte jede Datei ihr eigenes Pressable-Muster: gleiche Optik,
 * aber je eigene Mindesthöhe, eigenen Disabled-Zustand, eigene Pressed-Opacity
 * — und die Kern-CTAs sahen aus wie jede Nebenaktion. Diese Komponente bündelt
 * das: mindestens 44 Punkte hoch (WCAG 2.2 AA 2.5.8; 44 ist der bequeme Wert
 * aus Apple HIG / Material), Pressed- und Disabled-Zustand, `button`-Rolle.
 */
export function ThemedButton({ label, variant = 'secondary', disabled, ...rest }: ThemedButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';

  // Seit 22.10.2026: Hauptknopf mit Verlauf und Leuchten, Nebenknopf als
  // Glas mit Kante; beide sinken beim Druck federnd ein.
  return (
    <PressableScale
      disabled={disabled}
      accessibilityRole="button"
      // Ausdrücklich gesetzt (25.10.2026): Im Web kam die Beschriftung über
      // Verlauf und Animationsrahmen nicht als Name beim Screenreader an.
      // Ein eigenes `accessibilityLabel` in `rest` gewinnt weiterhin.
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[
        styles.button,
        primary
          ? { boxShadow: disabled ? undefined : `0 6px 22px ${theme.gradientStart}66` }
          : { backgroundColor: theme.glass, borderColor: theme.cardBorder, borderWidth: 1 },
      ]}
      {...rest}>
      {primary ? <GradientFill radius={14} /> : null}
      <View style={styles.label}>
        <ThemedText type={primary ? 'smallBold' : 'small'} style={primary ? { color: theme.gradientText } : null}>
          {label}
        </ThemedText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  label: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
});
