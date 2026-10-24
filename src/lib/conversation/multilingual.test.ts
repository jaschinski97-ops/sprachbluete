import { createSituationClient, userPrompt } from './generator';
import { planSituations } from './plan';
import { isValidSituation, localizedSituation, situationTranslation, spokenText } from './types';
import { UI_LANGUAGES } from '../i18n/types';
import { planClips } from '../clips/plan';

const payload = (text: string) => ({
  title: 'Einkaufen', setting: 'Im Laden',
  scriptTurns: ['partner','learner'].map(speaker => ({ speaker, targetText: text, thai: 'สวัสดี', roman: 'hello', german: 'Guten Tag' })),
  corrections: [{ issue: 'Anrede', explanation: 'Höflich bleiben' }],
  translations: Object.fromEntries(UI_LANGUAGES.map(code => [code, { title: `${code} Titel`, setting: `${code} Szene`, turns: [`${code} eins`, `${code} zwei`], corrections: [{ issue: `${code} Fehler`, explanation: `${code} Erklärung` }] }]))
});

test.each(['th','en','es','de'] as const)('erzeugt und vertont %s, Bedeutungen folgen der App-Sprache', async targetLanguage => {
  const specs = planSituations({ targetLanguage });
  // Ohne Stufenangabe A1/A2: 7 Themen auf A1, 9 auf A2.
  expect(specs).toHaveLength(16);
  expect(specs.every(s => s.direction.endsWith(`_to_${targetLanguage}`))).toBe(true);
  const text = { th: 'สวัสดี', en: 'Hello', es: 'Hola', de: 'Guten Tag' }[targetLanguage];
  const body = payload(text);
  const client = createSituationClient({ provider: 'gemini', model: 'test', complete: async () => ({ text: JSON.stringify(body), model: 'test' }) });
  const situation = await client.generate(specs[0]);
  expect(isValidSituation(situation)).toBe(true);
  expect(spokenText(situation, situation.scriptTurns[0])).toBe(text);
  expect(situationTranslation(situation, 'fr').turns[0]).toBe('fr eins');
  const view = localizedSituation(situation, 'fr');
  expect(view.scriptTurns[0]).toMatchObject({ thai: text, german: 'fr eins' });
  expect(spokenText(view, view.scriptTurns[0])).toBe(text);
  expect(situation.scriptTurns[0].german).toBe('Guten Tag');
  const clips = planClips({ includeWords: false, includeExamples: false, situations: [situation] });
  expect(clips[0]).toMatchObject({ language: targetLanguage, text });
  expect(userPrompt(specs[0])).toContain('10 Sprachcodes');
});

test('fehlende oder verschobene Übersetzungen werden vor dem Speichern abgelehnt', async () => {
  const body = payload('Hello');
  delete body.translations.fr;
  const make = () => createSituationClient({ provider: 'gemini', model: 'test', complete: async () => ({ text: JSON.stringify(body), model: 'test' }) });
  await expect(make().generate(planSituations({ targetLanguage: 'en' })[0])).rejects.toThrow(/App-Sprachen/);
  body.translations.fr = { ...body.translations.en, turns: ['nur eine Zeile'] };
  await expect(make().generate(planSituations({ targetLanguage: 'en' })[0])).rejects.toThrow(/übersetzungen/);
});
