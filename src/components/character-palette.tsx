import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { THAI_CONSONANTS, TONE_MARKS, TONE_MARK_KEYS } from '@/data/thai-script';
import { useToneColor } from '@/hooks/use-theme';
import { useLocale, type TranslationKey } from '@/lib/i18n';
import { learningLanguage } from '@/lib/languages/definitions';
import type { LanguageCode } from '@/lib/languages/types';

/**
 * Zeicheneingabe ohne Systemtastatur (Phase 14, AE-39).
 *
 * WARUM ES DAS GIBT — gemessen, nicht angenommen: Auf diesem Rechner ist
 * genau **eine** Tastaturbelegung aktiv (Deutsch). Windows bringt vier
 * Thai-Belegungen mit, keine davon ist eingeschaltet, und
 * `navigator.keyboard.getLayoutMap()` liefert im Web-Build eine **leere**
 * Liste — die App kann also nicht einmal feststellen, ob jemand Thai tippen
 * kann. Ein Eingabefeld ohne Hilfe wäre für die Mehrheit unbenutzbar.
 *
 * DAS IST KEINE KRÜCKE, SONDERN EINE TASTATUR. Wer „Haus" tippt, sieht die
 * Buchstaben auch vor sich; niemand nennt das Abschreiben. Der Unterschied zu
 * einer Auswahlaufgabe bleibt: Hier stehen alle Zeichen, nicht fünf fertige
 * Antworten — die Reihenfolge muss die lernende Person selbst kennen.
 *
 * Die Thai-Zeichen kommen aus den in Phase 13 erhobenen Daten
 * (`data/thai-script.ts`), nicht aus einer zweiten Liste.
 *
 * BARRIEREFREIHEIT (Pflicht 5): jede Taste mindestens 44 Punkte hoch, mit
 * eigener Beschriftung — bei einem einzelnen Thai-Zeichen läse ein
 * Screenreader sonst nur das Zeichen vor, das niemandem etwas sagt. Deshalb
 * steht dort der Name aus der Quelle („ก ไก่, ko kai").
 */

export type PaletteProps = {
  /** Fügt das Zeichen am Ende der Eingabe an. */
  onInsert: (character: string) => void;
  disabled?: boolean;
};

/** Vokalzeichen, wie sie ohne Konsonant dargestellt werden (mit ◌ als Platzhalter). */
const VOWEL_SIGNS: { character: string; display: string; name: string }[] = [
  { character: 'ะ', display: 'ะ', name: 'sara a' },
  { character: 'ั', display: '◌ั', name: 'mai han akat' },
  { character: 'า', display: 'า', name: 'lak khang' },
  { character: 'ิ', display: '◌ิ', name: 'sara i' },
  { character: 'ี', display: '◌ี', name: 'sara ii' },
  { character: 'ึ', display: '◌ึ', name: 'sara ue' },
  { character: 'ื', display: '◌ื', name: 'sara uee' },
  { character: 'ุ', display: '◌ุ', name: 'sara u' },
  { character: 'ู', display: '◌ู', name: 'sara uu' },
  { character: 'ํ', display: '◌ํ', name: 'nikkhahit' },
  { character: '็', display: '◌็', name: 'mai taikhu' },
  { character: 'ำ', display: 'ำ', name: 'sara am' },
  { character: 'เ', display: 'เ', name: 'sara e' },
  { character: 'แ', display: 'แ', name: 'sara ae' },
  { character: 'โ', display: 'โ', name: 'sara o' },
  { character: 'ใ', display: 'ใ', name: 'sara ai mai muan' },
  { character: 'ไ', display: 'ไ', name: 'sara ai mai malai' },
];

type Group = 'consonants' | 'vowels' | 'tones';

const GROUP_LABEL: Record<Group, TranslationKey> = {
  consonants: 'palette.consonants',
  vowels: 'palette.vowels',
  tones: 'palette.toneMarks',
};

function Key({
  label,
  spokenLabel,
  onPress,
  disabled,
  wide,
  tint,
}: {
  label: string;
  spokenLabel: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}>
      <ThemedView
        type="backgroundSelected"
        style={[styles.key, wide && styles.keyWide, tint ? { borderColor: tint, borderWidth: 1 } : null]}>
        {/* Thai-Zeichen mit über/unter der Grundlinie stehenden Diakritika:
            Zeilenhöhe statt Default und Deckel für die Systemschrift-Ver
            größerung, sonst schneiden die Tonzeichen an der Tastenkante ab
            (UI-Review 2026-09-07, Best-effort — 20 hat keine eigene
            Skalenstufe). */}
        <ThemedText maxFontSizeMultiplier={1.4} style={styles.keyText}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function ThaiPalette({ onInsert, disabled }: PaletteProps) {
  const { t } = useLocale();
  const [group, setGroup] = useState<Group>('consonants');
  const toneColor = useToneColor();

  return (
    <View style={styles.palette}>
      <View role="radiogroup" accessibilityLabel={t('palette.groupA11y')} style={styles.row}>
        {(Object.keys(GROUP_LABEL) as Group[]).map((candidate) => (
          <Pressable
            key={candidate}
            onPress={() => setGroup(candidate)}
            accessibilityRole="radio"
            accessibilityLabel={t(GROUP_LABEL[candidate])}
            aria-checked={group === candidate}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView
              type={group === candidate ? 'backgroundSelected' : 'backgroundElement'}
              style={[styles.tab, group === candidate && { borderColor: toneColor('mid'), borderWidth: 1 }]}>
              <ThemedText type="small">{t(GROUP_LABEL[candidate])}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.keyScroll} contentContainerStyle={styles.keys}>
        {group === 'consonants'
          ? THAI_CONSONANTS.map((consonant) => (
              <Key
                key={consonant.symbol}
                label={consonant.symbol}
                spokenLabel={`${consonant.name}, ${consonant.nameRtgs}`}
                onPress={() => onInsert(consonant.symbol)}
                disabled={disabled}
              />
            ))
          : null}
        {group === 'vowels'
          ? VOWEL_SIGNS.map((sign) => (
              <Key
                key={sign.character}
                label={sign.display}
                spokenLabel={`Vokalzeichen ${sign.name}`}
                onPress={() => onInsert(sign.character)}
                disabled={disabled}
              />
            ))
          : null}
        {group === 'tones'
          ? TONE_MARK_KEYS.map((mark) => (
              <Key
                key={mark}
                label={`◌${mark}`}
                spokenLabel={`Tonzeichen ${TONE_MARKS[mark].nameRtgs}`}
                onPress={() => onInsert(mark)}
                disabled={disabled}
                wide
                tint={toneColor('falling')}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

/**
 * Umlaute und ß für die deutsche Richtung.
 *
 * Sie sind **nicht** optional: Nach Pflicht 3 zählt „schon" für „schön" als
 * Fehler, und dann muss ö auch erreichbar sein. Eine thailändische
 * Tastaturbelegung hat keine Umlaute — ohne diese sieben Tasten wäre die
 * Strenge unfair.
 */
const GERMAN_SPECIALS = [
  { character: 'ä', name: 'palette.umlaut', letter: 'a' },
  { character: 'ö', name: 'palette.umlaut', letter: 'o' },
  { character: 'ü', name: 'palette.umlaut', letter: 'u' },
  { character: 'ß', name: 'palette.sharpS', letter: 'ß' },
  { character: 'Ä', name: 'palette.capitalUmlaut', letter: 'A' },
  { character: 'Ö', name: 'palette.capitalUmlaut', letter: 'O' },
  { character: 'Ü', name: 'palette.capitalUmlaut', letter: 'U' },
];

export function GermanPalette({ onInsert, disabled }: PaletteProps) {
  const { t } = useLocale();
  return (
    <View style={styles.palette}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('palette.germanHeading')}
      </ThemedText>
      <View style={styles.keys}>
        {GERMAN_SPECIALS.map((special) => (
          <Key
            key={special.character}
            label={special.character}
            spokenLabel={t(special.name as TranslationKey, { letter: special.letter })}
            onPress={() => onInsert(special.character)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Spanische Sonderzeichen (Phase 16).
 *
 * DERSELBE GRUND WIE BEI DEN UMLAUTEN: Der Akut ist geschützt — „hablo" gegen
 * „habló" ist eine andere Zeitform, „ano" gegen „año" ein anderes Wort. Wenn
 * das als Fehler zählt, muss es auch tippbar sein. Eine deutsche Belegung hat
 * weder á noch ñ.
 *
 * Die Großbuchstaben stehen bewusst nicht dabei: Anders als im Deutschen
 * beginnt im Spanischen kein Substantiv groß, und keine Zielform dieses
 * Grundstocks braucht sie.
 */
const SPANISH_SPECIALS = [
  { character: 'á', name: 'palette.acute', letter: 'a' },
  { character: 'é', name: 'palette.acute', letter: 'e' },
  { character: 'í', name: 'palette.acute', letter: 'i' },
  { character: 'ó', name: 'palette.acute', letter: 'o' },
  { character: 'ú', name: 'palette.acute', letter: 'u' },
  { character: 'ñ', name: 'palette.tilde', letter: 'n' },
  { character: 'ü', name: 'palette.trema', letter: 'u' },
];

export function SpanishPalette({ onInsert, disabled }: PaletteProps) {
  const { t } = useLocale();
  return (
    <View style={styles.palette}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('palette.spanishHeading')}
      </ThemedText>
      <View style={styles.keys}>
        {SPANISH_SPECIALS.map((special) => (
          <Key
            key={special.character}
            label={special.character}
            spokenLabel={t(special.name as TranslationKey, { letter: special.letter })}
            onPress={() => onInsert(special.character)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Französische Sonderzeichen (04.11.2026).
 *
 * Gleicher Grund wie bei Spanisch: Akzente zählen beim Schreiben („a“ gegen
 * „à“, „ou“ gegen „où“ sind andere Wörter). Die Leiste enthält alle Zeichen
 * des französischen Alphabets mit Diakritikum aus der Quelle von
 * `latin-alphabet.ts` außer den seltenen æ und ÿ. Großbuchstaben fehlen
 * bewusst, wie bei Spanisch.
 */
const FRENCH_SPECIALS = [
  { character: 'é', name: 'palette.acute', letter: 'e' },
  { character: 'è', name: 'palette.grave', letter: 'e' },
  { character: 'ê', name: 'palette.circumflex', letter: 'e' },
  { character: 'ë', name: 'palette.trema', letter: 'e' },
  { character: 'à', name: 'palette.grave', letter: 'a' },
  { character: 'â', name: 'palette.circumflex', letter: 'a' },
  { character: 'î', name: 'palette.circumflex', letter: 'i' },
  { character: 'ï', name: 'palette.trema', letter: 'i' },
  { character: 'ô', name: 'palette.circumflex', letter: 'o' },
  { character: 'ù', name: 'palette.grave', letter: 'u' },
  { character: 'û', name: 'palette.circumflex', letter: 'u' },
  { character: 'ü', name: 'palette.trema', letter: 'u' },
  { character: 'ç', name: 'palette.cedilla', letter: 'c' },
  { character: 'œ', name: 'palette.ligature', letter: 'oe' },
];

export function FrenchPalette({ onInsert, disabled }: PaletteProps) {
  const { t } = useLocale();
  return (
    <View style={styles.palette}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('palette.frenchHeading')}
      </ThemedText>
      <View style={styles.keys}>
        {FRENCH_SPECIALS.map((special) => (
          <Key
            key={special.character}
            label={special.character}
            spokenLabel={t(special.name as TranslationKey, { letter: special.letter })}
            onPress={() => onInsert(special.character)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  palette: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tab: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  keyScroll: {
    maxHeight: 220,
  },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  /** WCAG 2.2 AA 2.5.8 verlangt 24x24; 44 ist der bequeme Wert (Phase 9). */
  key: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  keyWide: {
    minWidth: 64,
  },
  keyText: {
    fontSize: 20,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});

/**
 * Die Zeichenleiste einer Lernsprache — welche es ist, steht in
 * `definitions.ts` (`palette`). Sprachen ohne Eintrag (Englisch) bekommen
 * keine: jedes Zeichen steht auf jeder lateinischen Tastatur.
 */
export function LanguagePalette({
  language,
  onInsert,
  disabled,
}: PaletteProps & { language: LanguageCode }) {
  const palette = learningLanguage(language).palette;
  if (palette === 'thai') return <ThaiPalette onInsert={onInsert} disabled={disabled} />;
  if (palette === 'german') return <GermanPalette onInsert={onInsert} disabled={disabled} />;
  if (palette === 'spanish') return <SpanishPalette onInsert={onInsert} disabled={disabled} />;
  if (palette === 'french') return <FrenchPalette onInsert={onInsert} disabled={disabled} />;
  return null;
}
