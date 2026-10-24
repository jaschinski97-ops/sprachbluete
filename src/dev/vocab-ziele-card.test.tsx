import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { baueWortschatzPrompt, begriffeAusBestand, VocabZieleCard, zielSchluessel } from './vocab-ziele-card';
import { LearningStagePicker } from '@/components/learning-stage-picker';
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

/** Ein KI-Wort im Format seit 24.10.2026: Bedeutungen, Begriff, Satz in allen App-Sprachen. */
const kiWort = (basis: (typeof VOCABULARY_TH)[number], concept = 'c:test_word') => ({
  ...basis,
  concept,
  translations: Object.fromEntries(UI_LANGUAGES.map(language => [language, 'test'])),
  exampleTranslations: Object.fromEntries(UI_LANGUAGES.map(language => [language, `Satz ${language}`])),
});

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
    const word = kiWort(VOCABULARY_TH[0], 'Rice (food)');
    await act(async () => { lauf.answer({ text: JSON.stringify({ woerter: [word] }), model: 'test' }); });
    expect(JSON.stringify(tree.toJSON())).toContain('Prüfung läuft (1 Paket gleichzeitig)');
    await act(async () => { lauf.answer(durchgelassen(1)); });
    // Selbstprüfung läuft zweimal, die Anzeige bleibt während beider Antworten aktiv.
    expect(tree.root.findByType(ProgressPanel).props.progress.done).toBe(false);
    await act(async () => { lauf.answer(durchgelassen(1)); });
    expect(JSON.stringify(tree.toJSON())).toContain('in den Grundstock übernommen');
    expect(tree.root.findByType(ProgressPanel).props.progress).toMatchObject({ processed: 1, ok: 1, done: false });
    // Das gestagede Wort läuft bewusst als „ungeprüft“ — sourceVerified
    // bedeutet „quellengeprüft“ und lehnt den Publish sonst ab (16.09.).
    expect(mockDeliver).toHaveBeenCalledWith('vocabulary', expect.objectContaining({ sourceVerified: false, learningStage: 'beginner' }));
    // Begriff normalisiert, Satz in allen App-Sprachen, Thai wortgleich, Deutsch aus derselben Liste.
    const geliefert = (mockDeliver.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(geliefert.concept).toBe('c:rice_food');
    expect(Object.keys(geliefert.exampleTranslations as object).sort()).toEqual([...UI_LANGUAGES].sort());
    expect((geliefert.exampleTranslations as Record<string, string>).th).toBe(VOCABULARY_TH[0].exampleTerm);
    expect(geliefert.exampleGerman).toBe('Satz de');
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
    const blacklist = kiWort(VOCABULARY_TH[0]);
    const neu = kiWort(VOCABULARY_TH[1]);
    await act(async () => { lauf.answer({ text: JSON.stringify({ woerter: [blacklist, neu] }), model: 'test' }); });
    expect(JSON.stringify(tree.toJSON())).toContain('Prüfung läuft (1 Paket gleichzeitig)');
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

test('the word goal is stored per language and stage; beginners keep the old key', async () => {
  expect(zielSchluessel('th', 'beginner')).toBe('vocabZiel-th');
  expect(zielSchluessel('th', 'experienced')).toBe('vocabZiel-th-experienced');
  expect(zielSchluessel('es', 'pro')).toBe('vocabZiel-es-pro');

  jest.mocked(readMeta).mockClear();
  jest.mocked(writeMeta).mockClear();
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<VocabZieleCard onFinished={() => {}} />); });
  expect(readMeta).toHaveBeenCalledWith('vocabZiel-th', 250);
  expect(readMeta).not.toHaveBeenCalledWith('vocabZiel-th-pro', 250);

  await act(async () => { tree.root.findByType(LearningStagePicker).props.onChange('pro'); });
  expect(readMeta).toHaveBeenCalledWith('vocabZiel-th-pro', 250);
  const freiesZiel = tree.root.findAllByProps({ accessibilityLabel: 'Freies Ziel für th' })
    .find(node => typeof node.props.onChangeText === 'function')!;
  await act(async () => { freiesZiel.props.onChangeText('2000'); });
  expect(writeMeta).toHaveBeenCalledWith('vocabZiel-th-pro', 2000);
  expect(writeMeta).not.toHaveBeenCalledWith('vocabZiel-th', 2000);
  await act(async () => { tree.unmount(); });
});


test('the prompt asks for 20 sentence translations, a concept and stage-fitting sentences', () => {
  const prompt = baueWortschatzPrompt({
    sprache: 'es', anzahl: 10, thema: '', stufe: 'beginner', bekannte: ['casa'], abgelehnt: [],
    begriffe: ['c:bank_money', 'c:house'], offeneBegriffe: ['c:bank_money'],
  });
  const satzZeile = prompt.split('\n').find(zeile => zeile.startsWith('exampleTranslations enthält'))!;
  for (const code of UI_LANGUAGES) expect(satzZeile).toContain(code);
  expect(satzZeile).toContain('Für es steht dort exampleTerm wortgleich');
  expect(prompt).toContain('"concept": "c:englisch_snake_case"');
  expect(prompt).toContain('c:bank_money | c:house');
  expect(prompt).toContain('in es noch nicht');
  expect(prompt).toContain('höchstens 8 Wörter');
  expect(prompt).not.toContain('"exampleGerman"');
  // Profi bekommt keinen Anfänger-Auftrag.
  const profi = baueWortschatzPrompt({ sprache: 'es', anzahl: 10, thema: '', stufe: 'pro', bekannte: [], abgelehnt: [], begriffe: [], offeneBegriffe: [] });
  expect(profi).toContain('Profi');
  expect(profi).not.toContain('höchstens 8 Wörter');
  expect(profi).toContain('(noch keine)');
  expect(profi).not.toContain('in es noch nicht');
});

test('shared concepts come from all learning languages; open ones only from the same stage', () => {
  const { begriffe, offene, belege } = begriffeAusBestand([
    { language: 'th', term: 'บ้าน', german: 'Haus', concept: 'c:house' },
    { language: 'en', term: 'house', german: 'Haus', concept: 'c:house' },
    { language: 'en', term: 'bank', german: 'Bank', concept: 'c:bank_money' },
    { language: 'de', term: 'Anspruch', german: 'Anspruch', concept: 'c:claim', learningStage: 'pro' },
    { language: 'en', term: 'old', concept: 'ki-en-0000' },
  ], 'th', 'beginner');
  expect(begriffe).toEqual(['c:bank_money', 'c:claim', 'c:house']);
  expect(offene).toEqual(['c:bank_money']);
  expect(belege['c:house']).toEqual(['th: บ้าน = Haus', 'en: house = Haus']);
});

test('a word without a usable concept is sorted out before the paid check', async () => {
  jest.useFakeTimers();
  mockDeliver.mockClear();
  const lauf = completeMitLoopStopp();
  jest.mocked(createTextClient).mockReturnValue({ provider: 'gemini', model: 'test', complete: lauf.complete } as never);
  jest.mocked(studioRequest).mockImplementation(async (path: string) => (path === '/vocabulary'
    ? { woerter: [{ id: 'ki-en-1', language: 'en', term: 'house', german: 'Haus', concept: 'c:house' }] }
    : {}) as never);
  jest.mocked(readMeta).mockImplementation(async () => null);
  let tree!: ReactTestRenderer;
  let run!: Promise<void>;
  try {
    await act(async () => { tree = create(<VocabZieleCard onFinished={() => {}} />); });
    await act(async () => {
      run = tree.root.findAllByType(Button).find(node => node.props.label === 'Fehlende Wörter erzeugen …')!.props.onPress();
    });
    // Der Auftrag kennt die Begriffe der anderen Lernsprachen.
    const auftrag = (lauf.complete.mock.calls[0] as unknown as [{ user: string }])[0].user;
    expect(auftrag).toContain('c:house');
    const ohneBegriff = { ...kiWort(VOCABULARY_TH[0]), concept: '***' };
    await act(async () => { lauf.answer({ text: JSON.stringify({ woerter: [ohneBegriff] }), model: 'test' }); });
    await act(async () => { await run; });
    expect(JSON.stringify(tree.toJSON())).toContain('1 aussortiert');
    expect(mockDeliver).not.toHaveBeenCalled();
    expect(lauf.complete).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  } finally {
    jest.useRealTimers();
  }
});
