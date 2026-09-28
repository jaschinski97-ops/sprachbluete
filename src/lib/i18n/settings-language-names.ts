import { LANGUAGE_ENDONYME } from './index';
import type { UiLanguage } from './types';

/** English names appear beside the native names only in the app-language picker. */
const ENGLISH_NAMES: Record<UiLanguage, string> = {
  ar: 'Arabic', bn: 'Bengali', de: 'German', en: 'English', es: 'Spanish',
  fr: 'French', hi: 'Hindi', id: 'Indonesian', ja: 'Japanese', ko: 'Korean',
  mr: 'Marathi', pt: 'Portuguese', ru: 'Russian', ta: 'Tamil', te: 'Telugu',
  th: 'Thai', tr: 'Turkish', ur: 'Urdu', vi: 'Vietnamese', zh: 'Chinese',
};

export function settingsLanguageName(language: UiLanguage): string {
  const native = LANGUAGE_ENDONYME[language];
  const english = ENGLISH_NAMES[language];
  return native === english ? english : `${native} · ${english}`;
}
