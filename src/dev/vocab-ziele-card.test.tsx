import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VocabZieleCard } from './vocab-ziele-card';
import { Button, ProgressPanel } from '@/components/generator-card';
import { createTextClient } from '@/lib/providers/text';
import { clearContentSelection, studioRequest } from './content-client';
import { readMeta, writeMeta } from '@/lib/repository';
import { VOCABULARY_TH } from '@/test-fixtures/legacy-vocabulary';
import { UI_LANGUAGES } from '@/lib/i18n/types';

const mockDeliver = jest.fn(async () => {});
const mockFlush = jest.fn(async () => {});
const mockFinish = jest.fn(async () => 0);
jest.mock('./content-client', () => ({
  studioRequest: jest.fn(async () => ({})), clearContentSelection: jest.fn(async () => ({})),
  startAutomaticDelivery: jest.fn(async () => ({ deliver: mockDeliver, flush: mockFlush, finish: mockFinish, failed: false })),
}));
jest.mock('@/lib/api-key', () => ({ loadApiKey: async () => 'test-only', getKeyStorageMode: async () => 'memory' }));
jest.mock('@/lib/providers/text', () => ({ createTextClient: jest.fn(() => ({ complete: jest.fn(async () => { throw Error('Mock-Aufruf angekommen'); }) })) }));
jest.mock('@/lib/repository', () => ({
  readMeta: jest.fn(async (key: string) => (key === 'vocabBlacklist-th' ? [] : null)),
  writeMeta: jest.fn(async () => {}),
}));

/** Der KI-Aufruf Nr. 4 wäre das Erzeugungs-Paket des ZWEITEN Loop-Durchgangs. */
function completeMitLoopStopp() {
  let aufrufe = 0;
  let answer!: (response: { text: string; model: string }) => void;
  const complete = jest.fn(() => {
    aufrufe += 1;
    if (aufrufe >= 4) return Promise.reject(Error('Test-Stopp nach dem ersten Paket'));
    return new Promise<{ text: string; model: string }>(resolve => { answer = resolve; });
  });
  return { complete, get answer() { return answer; } };
}

const durchgelassen = (anzahl: number) => ({
  text: JSON.stringify({ urteile: Array.from({ length: anzahl }, (_, index) => ({ index, urteil: 'bestehen', gruende: [] })) }),
  model: 'test',
});

beforeEach(() => {
  mockDeliver.mockReset().mockResolvedValue(undefined);
  mockFlush.mockReset().mockResolvedValue(undefined);
  mockFinish.mockReset().mockResolvedValue(0);
});

test('one click starts word generation and deletion follows the selected language scope', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<VocabZieleCard onFinished={() => {}} />); });
  const press = (label: string) => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label)
      ?? tree.root.findAllByProps({ accessibilityLabel: label }).find(node => typeof node.props.onPress === 'function');
    if (!button) throw Error(`Missing button ${label}`);
    return button.props.onPress();
  };
  expect(JSON.stringify(tree.toJSON())).not.toContain('Kreuzregel');
  await act(async () => { await press('Fehlende Wörter erzeugen …'); });
  expect(createTextClient).toHaveBeenCalled();
  // Der Fehlschlag ist prominent unterm Fortschritt sichtbar — nicht nur in
  // der grauen Meldung ganz unten („kein Progress, tut nichts“, 16.09.).
  expect(JSON.stringify(tree.toJSON())).toContain('Der Lauf ist fehlgeschlagen');
  expect(JSON.stringify(tree.toJSON())).toContain('Mock-Aufruf angekommen');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Kosten bestätigen');
  await act(async () => { await press('Englisch'); });
  await act(async () => { await press('Erzeugte Wörter löschen'); });
  expect(clearContentSelection).not.toHaveBeenCalled();
  await act(async () => { await press('Ausgewählte Wörter wirklich löschen?'); });
  expect(clearContentSelection).toHaveBeenLastCalledWith('vocabulary', ['en']);
  await act(async () => { await press('Alle Sprachen'); });
  await act(async () => { await press('Erzeugte Wörter löschen'); });
  await act(async () => { await press('Ausgewählte Wörter wirklich löschen?'); });
  expect(clearContentSelection).toHaveBeenLastCalledWith('vocabulary', ['th', 'en', 'es', 'de']);
  await act(async () => { tree.unmount(); });
});

test('loop delivers each word automatically, waits for acknowledgement, and stops on the next hard failure', async () => {
  jest.useFakeTimers();
  const lauf = completeMitLoopStopp();
  jest.mocked(createTextClient).mockReturnValue({ provider: 'gemini', model: 'test', complete: lauf.complete } as never);
  jest.mocked(studioRequest).mockResolvedValue({ shipped: { entries: [] }, stage: { entries: [] } } as never);
  mockFlush.mockImplementationOnce(async () => {}).mockImplementationOnce(() => new Promise<void>(resolve => {
    (lauf as { finishPublish?: () => void }).finishPublish = resolve;
  }));
  let tree!: ReactTestRenderer;
  let run!: Promise<void>;
  try {
    await act(async () => { tree = create(<VocabZieleCard onFinished={() => {}} />); });
    await act(async () => {
      run = tree.root.findAllByType(Button).find(node => node.props.label === 'Fehlende Wörter erzeugen …')!.props.onPress();
    });
    expect(JSON.stringify(tree.toJSON())).toContain('warte auf KI-Antwort');
    expect(tree.root.findByType(ProgressPanel).props.progress).toMatchObject({ processed: 0, done: false });
    await act(async () => { jest.advanceTimersByTime(31_000); });
    expect(JSON.stringify(tree.toJSON())).toContain('Läuft seit 0:31');
    const word = { ...VOCABULARY_TH[0], translations: Object.fromEntries(UI_LANGUAGES.map(language => [language, 'test'])) };
    await act(async () => { lauf.answer({ text: JSON.stringify({ woerter: [word] }), model: 'test' }); });
    expect(JSON.stringify(tree.toJSON())).toContain('Prüfpaket 1 / 1');
    await act(async () => { lauf.answer(durchgelassen(1)); });
    // Selbstprüfung läuft zweimal, die Anzeige bleibt während beider Antworten aktiv.
    expect(tree.root.findByType(ProgressPanel).props.progress.done).toBe(false);
    await act(async () => { lauf.answer(durchgelassen(1)); });
    expect(JSON.stringify(tree.toJSON())).toContain('in den Grundstock übernommen');
    expect(tree.root.findByType(ProgressPanel).props.progress).toMatchObject({ processed: 1, ok: 1, done: false });
    // Das gestagede Wort läuft bewusst als „ungeprüft“ — sourceVerified
    // bedeutet „quellengeprüft“ und lehnt den Publish sonst ab (16.09.).
    expect(mockDeliver).toHaveBeenCalledWith('vocabulary', expect.objectContaining({ sourceVerified: false, learningStage: 'beginner' }));
    expect(jest.mocked(studioRequest).mock.calls.some(([path]) => path === '/publish')).toBe(false);
    // Das zweite Paket scheitert hart (Mock) → der Loop stoppt, statt
    // weiter Geld zu verbrennen; das erste Paket bleibt veröffentlicht.
    await act(async () => {
      (lauf as { finishPublish?: () => void }).finishPublish?.();
      await run;
    });
    expect(tree.root.findByType(ProgressPanel).props.progress.done).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain('Loop beendet');
    expect(JSON.stringify(tree.toJSON())).toContain('Test-Stopp nach dem ersten Paket');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Generierung läuft');
    expect(mockFinish).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { tree?.unmount(); });
    jest.useRealTimers();
  }
});

test('blacklisted terms skip the paid check and rejected terms land on the blacklist', async () => {
  jest.useFakeTimers();
  // Aufruflisten der Vortests leeren — sonst sieht der Publish-Check die
  // Veröffentlichungen des Loop-Tests oben.
  jest.mocked(studioRequest).mockClear();
  jest.mocked(writeMeta).mockClear();
  const lauf = completeMitLoopStopp();
  jest.mocked(createTextClient).mockReturnValue({ provider: 'gemini', model: 'test', complete: lauf.complete } as never);
  jest.mocked(studioRequest).mockResolvedValue({ shipped: { entries: [] }, stage: { entries: [] } } as never);
  jest.mocked(readMeta).mockImplementation(async (key: string) => (key === 'vocabBlacklist-th' ? [VOCABULARY_TH[0].term] : null));
  let tree!: ReactTestRenderer;
  let run!: Promise<void>;
  try {
    await act(async () => { tree = create(<VocabZieleCard onFinished={() => {}} />); });
    await act(async () => {
      run = tree.root.findAllByType(Button).find(node => node.props.label === 'Fehlende Wörter erzeugen …')!.props.onPress();
    });
    // Paket 1: das blackgelistete Wort wird in Phase A aussortiert (ohne
    // bezahlten Prüfaufruf), das neue Wort wird abgelehnt und landet selbst
    // auf der Blacklist — danach stoppt der Loop ohne Fortschritt.
    const blacklist = { ...VOCABULARY_TH[0], translations: Object.fromEntries(UI_LANGUAGES.map(language => [language, 'test'])) };
    const neu = { ...VOCABULARY_TH[1], translations: Object.fromEntries(UI_LANGUAGES.map(language => [language, 'test'])) };
    await act(async () => { lauf.answer({ text: JSON.stringify({ woerter: [blacklist, neu] }), model: 'test' }); });
    expect(JSON.stringify(tree.toJSON())).toContain('Prüfpaket 1 / 1');
    const abgelehnt = {
      text: JSON.stringify({ urteile: [{ index: 0, urteil: 'mangel', gruende: ['Testgrund'] }] }),
      model: 'test',
    };
    await act(async () => { lauf.answer(abgelehnt); });
    await act(async () => { await run; });
    expect(JSON.stringify(tree.toJSON())).toContain('1 Blacklist-Treffer');
    expect(JSON.stringify(tree.toJSON())).toContain('Loop beendet');
    expect(JSON.stringify(tree.toJSON())).toContain('kein Fortschritt');
    expect(writeMeta).toHaveBeenCalledWith(
      'vocabBlacklist-th',
      [VOCABULARY_TH[0].term, VOCABULARY_TH[1].term],
    );
    // Nichts erzeugt → kein Publish, keine Kostenbestätigung nötig.
    expect(jest.mocked(studioRequest).mock.calls.some(([path]) => path === '/publish')).toBe(false);
    expect(mockDeliver).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  } finally {
    jest.useRealTimers();
  }
});
