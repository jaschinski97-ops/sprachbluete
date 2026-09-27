import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DrillRunner } from './drill-runner';
import { SentenceAction, SentenceRunner } from './sentence-runner';
import ReviewScreen from '@/app/review';
// Die Screens schreiben Fehlerzustände über i18n (`t('common.retry')`). Ohne
// Provider wählt dieser Test ausdrücklich Deutsch (siehe
// useLocale in lib/i18n) — die Assertion liest den Beschriftungstrotzdem aus
// dem de-Wörterbuch, damit sie die Semantik prüft und nicht einen zufällig
// gleichlautenden Textwitz der Oberfläche.
import { dictionaries, type TranslationKey } from '@/lib/i18n';

/** Die Wiederholen-Beschriftung des Fehlerzustands, wie sie die App zeigt. */
const ERNEUT_VERSUCHEN = dictionaries.de['common.retry']!;
/** Beschriftung eines Keys in der Referenzsprache Deutsch. */
const d = (key: TranslationKey) => dictionaries.de[key]!;
/** Der Teil des Runden-Hinweises nach dem interpolierten Rundenzähler. */
const ROUND_HINT_TAIL = d('sentence.roundHint').split('{{round}}')[1]!;
import type { MicrophoneCaptureController } from '@/lib/speaking/microphone-capture';
import { sentenceAnswers, sentenceSession } from '@/lib/speaking/sentence-session';
// Diese UI-Tests wählen Deutsch ausdrücklich; der Produkt-Default bleibt Englisch.
jest.mock('@/lib/i18n', () => {
  const actual = jest.requireActual('@/lib/i18n') as typeof import('@/lib/i18n');
  return { ...actual, useLocale: () => ({
    ...actual.useLocale(), uiLanguage: 'de',
    t: (key: import('@/lib/i18n').TranslationKey, params?: import('@/lib/i18n/types').TParams) => actual.translate('de', key, params),
    languageName: (code: import('@/lib/i18n').UiLanguage) => actual.languageDisplayName(code, 'de'),
  }) };
});



const mockPlay = jest.fn(async () => ({ kind: 'asset', label: 'KI-Stimme, Ton nicht geprüft', toneStatus: 'unchecked' }));
const mockStopAudio = jest.fn(async () => {});
const mockAvailable = jest.fn(async () => true);
const mockClip = jest.fn(async () => false);
const mockStart = jest.fn(async () => true);
const mockCancel = jest.fn();
const mockClear = jest.fn();
const mockRecording = { samples: new Float32Array(8000), sampleRate: 8000, durationMs: 1000, reachedLimit: false };
const mockStop = jest.fn(async () => mockRecording);
let mockOptions: { maxDurationMs?: number; allowPlayback?: boolean };
jest.mock('@/lib/audio', () => ({ playPronunciationWithStatus: (...args: unknown[]) => mockPlay(...args as []),
  stopPronunciation: () => mockStopAudio(), isLanguageAvailable: () => mockAvailable(), hasPronunciationClip: () => mockClip() }));
jest.mock('@/hooks/use-microphone-capture', () => ({ useMicrophoneCapture: (options: typeof mockOptions): MicrophoneCaptureController => {
  mockOptions = options;
  return { status: 'idle', isRecording: false, elapsedMs: 0, lastCapture: null, error: null,
    start: mockStart, stop: mockStop, cancel: mockCancel, clear: mockClear };
} }));
jest.mock('./measured-tone-contour', () => ({ MeasuredToneContour: () => null }));

// Fehlerzustands-Tests nach dem Muster des Fortschritts-Reiters. Sie leben in
// dieser Suite, weil nur sie zu den bearbeiteten Dateien gehört; keiner der
// Mocks wird von der Satzübung selbst geladen.
const mockBuildDrillSession = jest.fn();
const mockBuildReviewQueue = jest.fn();
const mockLoadProfile = jest.fn();
const mockSetReviewSpot = jest.fn();
jest.mock('@/lib/drills/session', () => ({
  buildDrillSession: (...args: unknown[]) => mockBuildDrillSession(...args as []),
  scoreAnswers: () => ({ correct: 0, total: 0 }),
}));
jest.mock('@/lib/review-log', () => ({ recordDrill: async () => {} }));
jest.mock('expo-router', () => ({
  // Der Lern-Reiter beginnt nun auf dem Pfad; dieser Fehlerfall öffnet
  // ausdrücklich die Karteikarten über ihre direkte Übungsadresse.
  useLocalSearchParams: () => ({ direction: 'de_to_th', mode: 'cards' }),
  useRouter: () => ({ setParams: jest.fn() }),
}));
jest.mock('@/lib/profile', () => ({
  loadProfile: (...args: unknown[]) => mockLoadProfile(...args as []),
  setLanguage: async (profile: unknown) => profile,
  setReviewSpot: (...args: unknown[]) => mockSetReviewSpot(...args as []),
}));
jest.mock('@/lib/review-session', () => ({
  buildReviewQueue: (...args: unknown[]) => mockBuildReviewQueue(...args as []),
  directionLabel: (direction: string) => direction,
}));
jest.mock('@/lib/repository', () => ({ rateCard: async () => {} }));
jest.mock('@/components/screen-scaffold', () => ({
  ScreenScaffold: ({ children }: { children?: ReactNode }) => children ?? null,
}));
jest.mock('@/components/speaking-runner', () => ({ SpeakingRunner: () => null }));
jest.mock('@/components/writing-runner', () => ({ WritingRunner: () => null }));

let tree: ReactTestRenderer;
function button(label: string) {
  const node = tree.root.findAllByType(SentenceAction).find(node => node.props.label === label);
  if (!node) throw Error('Missing ' + label);
  return node;
}
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(100000); jest.clearAllMocks(); mockAvailable.mockResolvedValue(true); mockStart.mockResolvedValue(true); mockStop.mockImplementation(async () => ({ ...mockRecording })); });
afterEach(async () => { await act(async () => tree?.unmount()); jest.useRealTimers(); });

test('shadowing enforces preparation, hearing and headphones before mic; plays only after mic succeeds', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="shadowing" onExit={() => {}} />); });
  expect(mockStart).not.toHaveBeenCalled();
  await press(d('sentence.start')); expect(mockStart).not.toHaveBeenCalled();
  await press(d('sentence.listen')); await press(d('sentence.headphones'));
  await press(d('sentence.start')); expect(mockStart).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(15000));
  mockPlay.mockClear();
  await press(d('sentence.start'));
  expect(mockStart).toHaveBeenCalledTimes(1); expect(mockPlay).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain(d('sentence.audioClip'));
  expect(mockOptions.allowPlayback).toBe(true);
  expect(mockPlay).toHaveBeenCalledWith(expect.objectContaining({ concurrentRecording: true }));
  expect(mockStart.mock.invocationCallOrder[0]).toBeLessThan(mockPlay.mock.invocationCallOrder[0]);
  await press(d('sentence.stop')); await act(async () => jest.advanceTimersByTime(1));
  expect(mockClear).toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain(d('sentence.noVoiced'));
  await press(d('sentence.nextSentence'));
  expect(button(d('sentence.start')).props.disabled).toBe(true);
});
test('sentence repetition runs 12/9/6 seconds with new mandatory preparation between rounds', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="sentenceRepeat" onExit={() => {}} />); });
  for (const [index, duration] of [12000, 9000, 6000].entries()) {
    expect(mockOptions.maxDurationMs).toBe(duration);
    expect(mockOptions.allowPlayback).toBe(false);
    await press(d('sentence.listen')); await act(async () => jest.advanceTimersByTime(15000));
    await press(d('sentence.start'));
    await press(d('sentence.stop')); await act(async () => jest.advanceTimersByTime(1));
    if (index < 2) { await press(d('sentence.nextWindow')); expect(button(d('sentence.start')).props.disabled).toBe(true); }
  }
  expect(button(d('sentence.nextSentence'))).toBeDefined();
});
test('hearing presents no transcript before answer, handles missing voice and evaluates sentence meaning once', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="sentenceListening" onExit={() => {}} />); });
  const task = sentenceSession('th', 100000)[0];
  expect(JSON.stringify(tree.toJSON())).not.toContain(task.text);
  expect(button(task.german).props.disabled).toBe(true);
  mockAvailable.mockResolvedValue(false); await press(d('sentence.listen'));
  expect(mockPlay).not.toHaveBeenCalled(); expect(button(task.german).props.disabled).toBe(true);
  mockAvailable.mockResolvedValue(true); await press(d('sentence.listen'));
  expect(JSON.stringify(tree.toJSON())).toContain(d('sentence.audioClip'));
  mockPlay.mockResolvedValueOnce({ kind: 'asset', label: 'KI-Stimme, Ton automatisch geprüft', toneStatus: 'passed' });
  await press(d('sentence.listenAgain'));
  expect(JSON.stringify(tree.toJSON())).toContain(d('sentence.audioClip'));
  expect(JSON.stringify(tree.toJSON())).not.toContain('KI-Stimme, Ton nicht geprüft');
  await press(task.german);
  expect(JSON.stringify(tree.toJSON())).toContain(d('sentence.correct'));
  expect(JSON.stringify(tree.toJSON())).toContain(task.text);
  expect(button(task.german).props.disabled).toBe(true);
  expect(mockStart).not.toHaveBeenCalled();
});
test('permission failure never plays the shadowing model into a nonexistent recording', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="shadowing" onExit={() => {}} />); });
  await press(d('sentence.listen')); await press(d('sentence.headphones'));
  await act(async () => jest.advanceTimersByTime(15000));
  mockStart.mockResolvedValue(false); mockPlay.mockClear(); await press(d('sentence.start'));
  expect(mockPlay).not.toHaveBeenCalled(); expect(button(d('sentence.start'))).toBeDefined();
});

test('leaving during permission request cancels capture and prevents late model playback', async () => {
  let release!: (value: boolean) => void;
  await act(async () => { tree = create(<SentenceRunner language="th" mode="shadowing" onExit={() => {}} />); });
  await press(d('sentence.listen')); await press(d('sentence.headphones'));
  await act(async () => jest.advanceTimersByTime(15000));
  mockStart.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  mockPlay.mockClear(); await press(d('sentence.start'));
  await act(async () => tree.unmount());
  await act(async () => release(true));
  expect(mockPlay).not.toHaveBeenCalled(); expect(mockCancel).toHaveBeenCalled();
});

test('a language without audited sentences shows an honest notice and never touches the microphone (AE-66)', async () => {
  // Die deutschen Test-Wörter tragen keine Beispielsätze.
  await act(async () => { tree = create(<SentenceRunner language="de" mode="shadowing" onExit={() => {}} />); });
  const json = JSON.stringify(tree.toJSON());
  // Der Sprachname kommt aus `languageOf` (lib-Inhalt, bleibt Deutsch) und ist
  // inzwischen Teil desselben interpolierten Text-Segments.
  expect(json).toContain(d('sentence.noneFor').replace('{{language}}', 'Deutsch'));
  expect(json).toContain(d('sentence.stockEmpty'));
  // Kein Aufnahme-/Wiedergabeknopf, keine Vorbereitungsuhr — nur der Hinweis.
  expect(json).not.toContain(d('sentence.start'));
  expect(json).not.toContain(d('sentence.listen'));
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockPlay).not.toHaveBeenCalled();
  expect(button(d('common.back'))).toBeDefined();
});

test('„Neue Runde“ würfelt die Aussaat neu: Satzfolge und Antwortmischung ändern sich', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="sentenceListening" onExit={() => {}} />); });
  const optionLabels = (task: { answers: string[] }) => {
    const wanted = new Set(task.answers);
    return tree.root.findAllByType(SentenceAction).map(node => node.props.label as string).filter(label => wanted.has(label));
  };
  // Beim Mount gilt die eingestellte Systemzeit 100000 als Aussaat.
  const firstRound = sentenceSession('th', 100000);
  const firstLabels = optionLabels(firstRound[0]);
  expect(firstLabels).toEqual(sentenceAnswers(firstRound[0], 100000));
  for (const task of firstRound) {
    await press(d('sentence.listen'));
    await press(task.german);
    await press(d('sentence.nextSentence'));
  }
  expect(button(d('drill.newRound'))).toBeDefined();
  // Eine Aussaat suchen, die nachweislich einen anderen ersten Satz liefert —
  // die Sitzung ist deterministisch, im Test gibt es keinen Zufall.
  let nextSeed = 100001;
  while (sentenceSession('th', nextSeed)[0].text === firstRound[0].text) nextSeed++;
  jest.setSystemTime(nextSeed);
  await press(d('drill.newRound'));
  const secondRound = sentenceSession('th', nextSeed);
  const secondLabels = optionLabels(secondRound[0]);
  expect(secondLabels).toEqual(sentenceAnswers(secondRound[0], nextSeed));
  expect(secondLabels).not.toEqual(firstLabels);
});

test('der 200-ms-Timer läuft nur, solange der Vorbereitungs-Countdown sichtbar ist', async () => {
  const startSpy = jest.spyOn(global, 'setInterval');
  const clearSpy = jest.spyOn(global, 'clearInterval');
  const countdownCalls = () => startSpy.mock.calls.filter(call => call[1] === 200);
  // Satz verstehen zeigt keinen Countdown — hier läuft überhaupt kein Intervall.
  await act(async () => { tree = create(<SentenceRunner language="th" mode="sentenceListening" onExit={() => {}} />); });
  expect(countdownCalls()).toHaveLength(0);
  await act(async () => tree.unmount());
  // Shadowing: Countdown nur in der Vorbereitungsphase, geräumt mit der
  // Aufnahmestufe.
  startSpy.mockClear(); clearSpy.mockClear();
  await act(async () => { tree = create(<SentenceRunner language="th" mode="shadowing" onExit={() => {}} />); });
  expect(countdownCalls()).toHaveLength(1);
  const handleIndex = startSpy.mock.calls.findIndex(call => call[1] === 200);
  const handle = startSpy.mock.results[handleIndex].value;
  await press(d('sentence.listen'));
  await press(d('sentence.headphones'));
  await act(async () => jest.advanceTimersByTime(15000));
  await press(d('sentence.start'));
  expect(clearSpy).toHaveBeenCalledWith(handle);
  await act(async () => tree.unmount());
});

test('der Methodik-Hintergrund ist eingeklappt und lässt sich auf- und zuklappen', async () => {
  await act(async () => { tree = create(<SentenceRunner language="th" mode="sentenceRepeat" onExit={() => {}} />); });
  const json = () => JSON.stringify(tree.toJSON());
  const toggle = () => tree.root.findByProps({ accessibilityLabel: d('sentence.hintA11y') });
  // Der kurze Runden-Hinweis bleibt sichtbar, die mehrsätzigen Hinweise nicht.
  expect(json()).toContain(ROUND_HINT_TAIL);
  expect(json()).not.toContain(d('sentence.hintRepeat'));
  // „unvorhersehbares Gegenüber“ steht in SENTENCE_LIMITS (lib-Inhalt, bleibt
  // laut Architektur-Entscheidung Deutsch).
  expect(json()).not.toContain(d('sentence.limits'));
  expect(toggle().props.accessibilityState.expanded).toBe(false);
  await act(async () => toggle().props.onPress());
  expect(json()).toContain(d('sentence.hintRepeat'));
  expect(json()).toContain(d('sentence.limits'));
  expect(toggle().props.accessibilityState.expanded).toBe(true);
  await act(async () => toggle().props.onPress());
  expect(json()).not.toContain(d('sentence.hintRepeat'));
  expect(json()).not.toContain(d('sentence.limits'));
});

test('drill-runner zeigt einen Fehlerzustand statt eines endlosen Spinners, wenn das Zusammenstellen scheitert', async () => {
  mockBuildDrillSession.mockRejectedValue(new Error('Speicher defekt'));
  await act(async () => { tree = create(<DrillRunner drill="tone" language="th" onExit={() => {}} />); });
  const json = () => JSON.stringify(tree.toJSON());
  expect(json()).toContain('Speicher defekt');
  expect(json()).toContain(ERNEUT_VERSUCHEN);
  // „Erneut versuchen“ baut die Sitzung wirklich neu auf.
  await act(async () => {
    tree.root.findAll(node => node.props.accessibilityRole === 'button')[0].props.onPress();
  });
  expect(mockBuildDrillSession).toHaveBeenCalledTimes(2);
});

test('CardSession des Lernen-Reiters zeigt einen Fehlerzustand, wenn die Warteschlange nicht lädt', async () => {
  const profile = { language: 'th', review: null, conversation: null };
  mockLoadProfile.mockResolvedValue(profile);
  mockSetReviewSpot.mockResolvedValue(profile);
  mockBuildReviewQueue.mockRejectedValue(new Error('Karteikasten defekt'));
  await act(async () => { tree = create(<ReviewScreen />); });
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Karteikasten defekt');
  expect(json).toContain(ERNEUT_VERSUCHEN);
});

test('identische Silben behalten eigene Antwort-Keys', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockBuildDrillSession.mockResolvedValue({ available: 1, drill: 'stressHear', questions: [{
    id: 'stressHear:mama', drill: 'stressHear', direction: 'de_to_es', vocabId: 'mama',
    visible: null, visibleHint: null, speak: null, solution: 'mamá', explanation: '',
    options: [{ label: 'ma', hint: '1' }, { label: 'ma', hint: '2' }], correctIndex: 1,
  }] });
  try {
    await act(async () => { tree = create(<DrillRunner drill="stressHear" language="es" onExit={() => {}} />); });
    expect(JSON.stringify(tree.toJSON())).toContain('ma');
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key|unique.*key/i);
  } finally { errors.mockRestore(); }
});
