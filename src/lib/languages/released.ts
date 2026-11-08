import { LANGUAGE_CODES, type LanguageCode } from './types';

/**
 * Die Lernsprachen, die ein Build anbietet (08.11.2026, Update 1.1 ohne die
 * neuen Sprachen).
 *
 * Der Store-Build (eas.json, Profil `production`) bettet keine Hörclips und
 * Bilder ein, sie kommen aus den Sprachpaketen `pack-<lang>-v<N>`. Eine
 * Lernsprache ohne veröffentlichtes Paket hätte dort weder Clips noch Bilder,
 * und ihr Download-Knopf liefe ins Leere. Deshalb nennt
 * `EXPO_PUBLIC_LERNSPRACHEN` die freigegebenen Codes, durch Komma getrennt
 * (`th,en,es,de`). Ohne Angabe (Entwicklung, Studio, Jest) gelten alle.
 *
 * Eine neue Sprache freigeben: Paket bauen und veröffentlichen
 * (`npm run pack:build`/`pack:publish`, docs/PIPELINE.md §5), dann ihren Code
 * in eas.json eintragen. Der Katalog bleibt unberührt; ausgeblendet ist die
 * Sprache nur als Lernziel. App-Sprache bleibt sie.
 */
export function parseReleasedLanguages(value: string | undefined): readonly LanguageCode[] {
  if (!value?.trim()) return LANGUAGE_CODES;
  const wanted = new Set(value.split(',').map((code) => code.trim()));
  const released = LANGUAGE_CODES.filter((code) => wanted.has(code));
  // Ein Tippfehler darf keinen Build ohne Lernsprache ergeben.
  return released.length ? released : LANGUAGE_CODES;
}

// Wörtlich `process.env.EXPO_PUBLIC_…`: Nur so setzt Expo den Wert beim
// Bauen ein (babel-preset-expo, inline-env-vars).
export const RELEASED_LEARNING_LANGUAGES: readonly LanguageCode[] = parseReleasedLanguages(
  process.env.EXPO_PUBLIC_LERNSPRACHEN
);

export function isReleasedLearningLanguage(code: LanguageCode): boolean {
  return RELEASED_LEARNING_LANGUAGES.includes(code);
}
