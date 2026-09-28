import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { buildToneQuestion } from '@/lib/drills/questions';
import { Flashcard } from './flashcard';
import { DrillRunner } from './drill-runner';
// Diese UI-Tests wählen Deutsch ausdrücklich; der Produkt-Default bleibt Englisch.
jest.mock('@/lib/i18n', () => {
  const actual = jest.requireActual('@/lib/i18n') as typeof import('@/lib/i18n');
  return { ...actual, useLocale: () => ({
    ...actual.useLocale(), uiLanguage: 'de',
    t: (key: import('@/lib/i18n').TranslationKey, params?: import('@/lib/i18n/types').TParams) => actual.translate('de', key, params),
    languageName: (code: import('@/lib/i18n').UiLanguage) => actual.languageDisplayName(code, 'de'),
  }) };
});



const mockPlayback = jest.fn();
const mockHasClip = jest.fn();
const mockRecord = jest.fn(async () => {});
jest.mock('@/lib/audio', () => ({
  playPronunciationWithStatus: (...args: unknown[]) => mockPlayback(...args),
  hasPronunciationClip: (...args: unknown[]) => mockHasClip(...args),
  isLanguageAvailable: async () => true,
}));
jest.mock('@/lib/review-log', () => ({ recordDrill: (...args: unknown[]) => mockRecord(...args as []) }));
jest.mock('@/lib/drills/session', () => ({
  buildDrillSession: async (options: { isEligible: (entry: unknown) => Promise<boolean> }) => {
    const word = require('@/test-fixtures/legacy-vocabulary').VOCABULARY_TH.find((entry: { id: string }) => entry.id === 'kha');
    return { questions: await options.isEligible(word) ? [require('@/lib/drills/questions').buildToneQuestion(word)] : [] };
  },
  scoreAnswers: () => ({ correct: 0, total: 0 }),
}));
const word = VOCABULARY_TH.find(entry => entry.id === 'kha')!;
let tree: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { await act(async () => tree?.unmount()); });

test('X_to_de-Karte: Brückenseite stumm; aufgedeckt liest die Gerätestimme das deutsche Wort', async () => {
  await act(async () => { tree = create(<Flashcard entry={word} direction="th_to_de" revealed={false} />); });
  expect(JSON.stringify(tree.toJSON())).toContain(word.romanization);
  // Nutzerentscheidung 10.09.: Die Brückensprache (hier Thai) bleibt stumm —
  // auf der unverdeckten Karte gibt es keinen Audio-Knopf.
  const knoepfe = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button');
  expect(knoepfe().filter(node => String(node.props.accessibilityLabel ?? '').includes('anhören'))).toHaveLength(0);
  await act(async () => { tree.update(<Flashcard entry={word} direction="th_to_de" revealed={true} />); });
  mockPlayback.mockResolvedValueOnce({ kind: 'tts', label: 'audio.systemVoice' });
  // Der Deutsch-Knopf trägt das listenGermanA11y-Label (a11y-Label = Label + Text).
  const deutschKnopf = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').startsWith('Deutsch anhören'))[0];
  await act(async () => deutschKnopf().props.onPress());
  expect(mockPlayback).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'de', text: word.german }));
});

test('vocabulary playback displays this clip status and clears the previous clip label when the word changes', async () => {
  mockPlayback.mockResolvedValueOnce({ kind: 'asset', toneStatus: 'unchecked', label: 'audio.toneUnchecked' })
    .mockResolvedValueOnce({ kind: 'asset', toneStatus: 'passed', label: 'audio.tonePassed' });
  await act(async () => { tree = create(<Flashcard entry={word} direction="de_to_th" revealed={true} />); });
  const press = async () => act(async () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button')[0].props.onPress());
  await press();
  expect(mockPlayback).toHaveBeenLastCalledWith(expect.objectContaining({ purpose: 'vocabulary', text: word.term }));
  expect(JSON.stringify(tree.toJSON())).toContain('KI-Stimme, Ton nicht geprüft');
  await press();
  expect(JSON.stringify(tree.toJSON())).toContain('KI-Stimme, Ton automatisch geprüft');
  expect(JSON.stringify(tree.toJSON())).not.toContain('KI-Stimme, Ton nicht geprüft');
  await act(async () => { tree.update(<Flashcard entry={VOCABULARY_TH[0]} direction="de_to_th" revealed={true} />); });
  expect(JSON.stringify(tree.toJSON())).not.toContain('KI-Stimme, Ton automatisch geprüft');
});

test('tone recognition does not offer or play an unchecked clip even when a system voice exists', async () => {
  mockHasClip.mockResolvedValue(false);
  await act(async () => { tree = create(<DrillRunner drill="tone" language="th" onExit={() => {}} />); });
  expect(mockHasClip).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'tone' }));
  // Der Leerzustand sagt in Lernersprache, dass ungeprüfte Stoffe bewusst
  // außen vor bleiben — genau diese Ehrlichkeit ist hier die Assertion.
  expect(JSON.stringify(tree.toJSON())).toContain('Ungeprüfte Clips und Computerstimmen werden bewusst nicht benutzt');
  expect(mockPlayback).not.toHaveBeenCalled(); expect(mockRecord).not.toHaveBeenCalled();
});

test('tone answers stay blocked until a passed clip actually starts', async () => {
  mockHasClip.mockResolvedValue(true);
  let finish!: (value: unknown) => void;
  mockPlayback.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { tree = create(<DrillRunner drill="tone" language="th" onExit={() => {}} />); });
  const label = buildToneQuestion(word).options[0].label;
  const option = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
  expect(option().props.disabled).toBe(true);
  await act(async () => option().props.onPress()); expect(mockRecord).not.toHaveBeenCalled();
  expect(mockPlayback).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'tone' }));
  await act(async () => finish({ kind: 'asset', toneStatus: 'passed', label: 'audio.tonePassed' }));
  expect(option().props.disabled).toBe(false);
  await act(async () => option().props.onPress()); expect(mockRecord).toHaveBeenCalledTimes(1);
});
