import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  // Karten (`backgroundElement`) sind seit 22.10.2026 Glas: halbdurchsichtig
  // über der Aurora, mit feiner Kante. Die Kontrast-Tokens bleiben die
  // deckenden Werte (Glas liegt immer auf dem dunklen bzw. hellen Grund).
  if (type === 'backgroundElement') {
    return (
      <View
        style={[{ backgroundColor: theme.glass, borderColor: theme.cardBorder }, styles.glass, style]}
        {...otherProps}
      />
    );
  }
  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}

const styles = StyleSheet.create({
  glass: {
    borderWidth: 1,
  },
});
