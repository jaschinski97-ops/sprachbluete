import { UI_LANGUAGES } from './types';
import { settingsLanguageName } from './settings-language-names';

test('alle App-Sprachen sind in der Sprachwahl auch auf Englisch lesbar', () => {
  expect(UI_LANGUAGES.map(settingsLanguageName)).toHaveLength(12);
  expect(settingsLanguageName('it')).toBe('italiano · Italian');
  expect(settingsLanguageName('ja')).toBe('日本語 · Japanese');
  expect(settingsLanguageName('ar')).toBe('العربية · Arabic');
  expect(settingsLanguageName('th')).toBe('ภาษาไทย · Thai');
  expect(settingsLanguageName('en')).toBe('English');
  expect(UI_LANGUAGES.every((language) => settingsLanguageName(language).trim().length > 0)).toBe(true);
});
