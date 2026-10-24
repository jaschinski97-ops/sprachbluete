import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { VocabEntry } from '@/data/vocab-types';
import { loadVocabImageUri } from '@/lib/repository';

/**
 * Das Bild zu einer Vokabel — falls eines erzeugt wurde.
 *
 * Zeigt nichts an, solange keines vorliegt: kein Platzhalter, kein
 * reservierter Kasten. Bilder sind ausdrücklich optional (der Grundstock muss
 * ohne Schlüssel und ohne Netz vollständig sein), und eine leere Fläche auf
 * jeder zweiten Karte wäre eine dauernde Erinnerung an etwas, das gar nicht
 * fehlt.
 *
 * Die Quelle kommt über die Repository-Schicht; ob dahinter eine Datei auf dem
 * Gerät oder ein Eintrag in der IndexedDB steckt, weiß die Karte nicht
 * (AE-14).
 */

export function VocabImageView({ entry }: { entry: VocabEntry }) {
  // Die Quelle haengt an der Vokabel-ID: Beim Kartenwechsel zeigt der erste
  // Render sonst noch die URI der vorigen Karte.
  const [loaded, setLoaded] = useState<{ id: string; uri: string | null } | null>(null);
  const uri = loaded?.id === entry.id ? loaded.uri : null;

  useEffect(() => {
    let active = true;
    // Abstrakte Einträge haben nie ein Bild - gar nicht erst nachsehen.
    if (!entry.isConcrete) return;
    // Sprache mitgeben: Ein installiertes Sprachpaket gewinnt gegen das
    // eingebettete Asset (Pack-Bild-Naht, Roadmap v2). Das Wort selbst
    // mitgeben: Das Bild hängt seit 24.10.2026 an seinem Begriff.
    loadVocabImageUri(
      { id: entry.id, concept: entry.concept, language: entry.language },
      undefined,
      undefined,
      entry.language
    )
      .then((found) => {
        if (active) setLoaded({ id: entry.id, uri: found });
      })
      .catch(() => {
        // Kein Bild ist kein Fehler, der den Lernfluss stören darf.
      });
    return () => {
      active = false;
    };
  }, [entry.id, entry.concept, entry.isConcrete, entry.language]);

  if (!uri) return null;

  return (
    // key/recyclingKey: neue Karte = neues Bild. expo-image blendet sonst vom
    // alten Motiv ueber, das bis zum Laden des neuen sichtbar bleibt
    // (Testlauf 04.10.2026: „Arzt" lag ueber dem Bild von „Fenster").
    <View key={entry.id} style={styles.frame}>
      <Image
        recyclingKey={entry.id}
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        accessibilityLabel={`Bild zu ${entry.german}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 200,
    height: 200,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
