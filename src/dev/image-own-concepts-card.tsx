import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseOwnConcepts } from '@/lib/images/own-concepts';
import type { ImagePlanSummary } from '@/lib/images/plan';

/**
 * Bilder je Begriff im Studio (24.10.2026): was der Lauf spart, und welche
 * Begriffe in der gewählten Sprache ein eigenes Bild bekommen sollen.
 * Die Ausnahme ist freiwillig; leer heißt, alle Sprachen teilen ein Bild.
 */
export function ImageOwnConceptsCard({
  languageLabel,
  concepts,
  summary,
  onChange,
}: {
  languageLabel: string;
  concepts: string[];
  summary: ImagePlanSummary | null;
  onChange: (concepts: string[]) => void;
}) {
  const theme = useTheme();
  const gespeichert = concepts.join(', ');
  // Eingabepuffer: gespeichert wird erst beim Verlassen des Felds.
  const [text, setText] = useState(gespeichert);
  const [letzter, setLetzter] = useState(gespeichert);
  if (gespeichert !== letzter) {
    setLetzter(gespeichert);
    setText(gespeichert);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <ThemedText type="smallBold">Ein Bild je Begriff</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {summary
          ? `${languageLabel}: ${summary.words} bildfähige Wörter, ${summary.images} Begriffe. ` +
            `${summary.existing} haben schon ein Bild (auch aus anderen Sprachen), ` +
            `${summary.toGenerate} neue Bilder nötig — ${summary.saved} gespart gegenüber einem Bild je Wort.`
          : '…'}
      </ThemedText>
      <ThemedText type="small">
        Eigenes Bild nur für {languageLabel} (kulturabhängig, z. B. Geld, typisches Essen) — Begriffe mit Komma
        getrennt. Leer lassen, wenn alle Sprachen dasselbe Bild nutzen sollen.
      </ThemedText>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const neu = parseOwnConcepts(text);
          if (neu.join(', ') !== gespeichert) onChange(neu);
          else setText(gespeichert);
        }}
        placeholder="c:money, c:breakfast"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`Begriffe mit eigenem Bild für ${languageLabel}`}
        style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
});
