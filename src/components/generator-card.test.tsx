import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { Button, GeneratorCard, type StartArgs } from './generator-card';

jest.mock('@/lib/api-key', () => ({
  loadApiKey: async () => 'test-key-never-sent', getKeyStorageMode: async () => 'memory',
  clearApiKey: jest.fn(), looksLikeApiKey: () => true, saveApiKey: jest.fn(),
}));

test('conversation starts directly and its deletion applies to the selected target or all of them', async () => {
  const provider = jest.fn(async () => {});
  const remove = jest.fn(async () => {});
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GeneratorCard heading="Dialoge" description="Dialoge" group="situations"
    managedKeys language="de" onLanguageChange={() => {}}
    choice={{ provider: 'gemini', model: 'test' }} onChoiceChange={() => {}} statusLine="Test"
    runOptions={[{ id: 'full', label: 'Vollständig', hint: 'Test' }]}
    onStart={async ({ confirmRun }) => { if (await confirmRun({ count: 1, usd: null, basis: 'Test' })) await provider(); }}
    onFinished={() => {}} onDelete={remove} canDelete deleteLabel="Erzeugte Situationen löschen"
    allRun={{ label: 'Alle Sprachen', steps: [] }} />); });
  const press = (label: string) => tree.root.findAllByType(Button).find(node => node.props.label === label)!.props.onPress();
  await act(async () => { await press('Start'); });
  expect(provider).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Kosten bestätigen');
  expect(tree.root.findAllByType(Button).some(node => node.props.label === 'Anbieter & Schlüssel')).toBe(false);
  await act(async () => { await press('Erzeugte Situationen löschen'); });
  expect(remove).not.toHaveBeenCalled();
  await act(async () => { await press('Wirklich löschen: Deutsch?'); });
  expect(remove).toHaveBeenLastCalledWith(['de']);
  await act(async () => { await press('Alle Sprachen'); });
  await act(async () => { await press('Erzeugte Situationen löschen'); });
  await act(async () => { await press('Wirklich löschen: Alle Sprachen?'); });
  expect(remove).toHaveBeenLastCalledWith(['th', 'en', 'es', 'de', 'fr']);
  await act(async () => { tree.unmount(); });
});

test('Lauf startet ohne Kostenbestätigung direkt — keine Box, kein Zwischen-Knopf (Nutzerwunsch 17.09.)', async () => {
  const provider = jest.fn(async () => {});
  const automaticExport = jest.fn(async () => {});
  const onStart = async ({ confirmRun }: StartArgs) => {
    if (!await confirmRun({ count: 2, usd: 0.1, basis: 'Test estimate', delivery: {
      total: 3, toneCheckable: 1, technicalOnly: 1, uncheckedDelivered: 0, excluded: 1,
      reasons: { 'Ungeprüftes Satzaudio': 1 },
    } })) return;
    await provider(); await provider(); await automaticExport();
  };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GeneratorCard heading="Test" description="Test" group="audio"
    choice={{ provider: 'gemini', model: 'gemini-3.1-flash-tts-preview', voice: 'Kore' }}
    onChoiceChange={() => {}} statusLine="Test" runOptions={[{ id: 'full', label: 'Alle', hint: '2 Clips' }]}
    onStart={onStart} onFinished={() => {}} onDelete={async () => {}} canDelete={false} deleteLabel="Löschen" />); });
  const press = (label: string) => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
    if (!button) throw Error('Missing button ' + label);
    button.props.onPress();
  };
  await act(async () => { press('Start'); });
  // Der Lauf läuft sofort — der frühere „Kosten bestätigen"-Knopf existiert
  // nicht mehr, auch der Auslieferungsvorschau-Block erscheint nie.
  expect(provider).toHaveBeenCalledTimes(2);
  expect(automaticExport).toHaveBeenCalledTimes(1);
  const json = JSON.stringify(tree.toJSON());
  expect(json).not.toContain('Kosten bestätigen');
  expect(json).not.toContain('Auslieferungsvorschau');
  await act(async () => { tree.unmount(); });
});

test('„Alle Sprachen“ übergibt die Kette und startet direkt (eine Bestätigung im Vertrag, immer wahr)', async () => {
  const schritte = [{ key: 'th', label: 'Thai' }, { key: 'es', label: 'Spanisch' }];
  const erhalteneKette: ({ key: string; label: string }[] | undefined)[] = [];
  let bestaetigungen = 0;
  // Hält den „Kettenlauf“ an, während wir den Baum außerhalb prüfen.
  let ketteFortsetzen: () => void = () => {};
  const onStart = async ({ chain, onChainStep, confirmRun }: StartArgs) => {
    erhalteneKette.push(chain);
    if (!await confirmRun({ count: 2, usd: 0.2, basis: 'Kette' })) return;
    bestaetigungen += 1;
    onChainStep?.({ index: 2, total: 2, label: 'Spanisch' });
    await new Promise<void>((resolve) => { ketteFortsetzen = resolve; });
  };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GeneratorCard heading="Test" description="Test" group="images"
    choice={{ provider: 'gemini', model: 'gemini-3.1-flash-image', voice: '' }}
    language="th" onLanguageChange={() => {}}
    onChoiceChange={() => {}} statusLine="Test" runOptions={[{ id: 'full', label: 'Alle', hint: '2 Bilder' }]}
    onStart={onStart} onFinished={() => {}} onDelete={async () => {}} canDelete={false} deleteLabel="Löschen"
    allRun={{ label: 'Alle Sprachen', steps: schritte }} />); });
  const press = (label: string) => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
    if (!button) throw Error('Missing button ' + label);
    button.props.onPress();
  };
  // Phase 2, Schritt 2: „Alle Sprachen“ ist Teil der Sprachwahl — erst der
  // Auswahlknopf „Alle“, dann startet der Haupt-Knopf (jetzt als
  // „Alle Sprachen erzeugen“ beschriftet) die Kette.
  await act(async () => { press('Alle Sprachen'); });
  await act(async () => { press('Alle Sprachen erzeugen'); });
  // Direkt gestartet, ohne Zwischen-Knopf — und genau EIN confirmRun-Aufruf
  // für die ganze Kette, nicht einer je Schritt.
  expect(bestaetigungen).toBe(1);
  expect(erhalteneKette[0]).toEqual(schritte);
  expect(JSON.stringify(tree.toJSON())).toContain('Anhalten');
  expect(tree.root.findAllByType(Button).find(node => node.props.label === 'Alle Sprachen')
    ?.props.disabled).toBe(true);
  // Mitten im Kettenlauf steht, welcher Schritt von wie vielen läuft.
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Schritt 2 / 2 · Spanisch');
  expect(json).not.toContain('Kosten bestätigen');
  await act(async () => { ketteFortsetzen(); });
  await act(async () => { tree.unmount(); });
});

test('„Max. neue erzeugen“ geht als maxNew durch; leer bleibt unbegrenzt', async () => {
  const erhaltene: StartArgs[] = [];
  const onStart = async (args: StartArgs) => { erhaltene.push(args); };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GeneratorCard heading="Test" description="Test" group="images"
    choice={{ provider: 'gemini', model: 'gemini-3.1-flash-image', voice: '' }}
    onChoiceChange={() => {}} statusLine="Test" runOptions={[{ id: 'full', label: 'Alle', hint: '2 Bilder' }]}
    onStart={onStart} onFinished={() => {}} onDelete={async () => {}} canDelete={false} deleteLabel="Löschen" />); });
  const press = (label: string) => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
    if (!button) throw Error('Missing button ' + label);
    button.props.onPress();
  };
  const feld = tree.root.findAllByType(TextInput)
    .find(node => node.props.accessibilityLabel === 'Max. neue erzeugen für Test');
  if (!feld) throw Error('Missing cap input');
  // Fremdzeichen werden herausgefiltert — negativ kann nicht entstehen.
  await act(async () => { feld.props.onChangeText('12x-9'); });
  expect(feld.props.value).toBe('129');
  await act(async () => { press('Start'); });
  expect(erhaltene[0].maxNew).toBe(129);
  expect(JSON.stringify(tree.toJSON())).toContain('begrenzt auf max. 129 neue');
  // Leer heißt: alles Fehlende, keine Begrenzung.
  await act(async () => { feld.props.onChangeText(''); });
  await act(async () => { press('Start'); });
  expect(erhaltene[1].maxNew).toBeUndefined();
  // „0“ ist ausdrücklich erlaubt und bedeutet ebenfalls unbegrenzt.
  await act(async () => { feld.props.onChangeText('0'); });
  await act(async () => { press('Start'); });
  expect(erhaltene[2].maxNew).toBeUndefined();
  await act(async () => { tree.unmount(); });
});

test('Die Zähler-Zeile zeigt den Bestand je Sprache mit Hervorhebung der Wahl', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GeneratorCard heading="Test" description="Test" group="images"
    choice={{ provider: 'gemini', model: 'gemini-3.1-flash-image', voice: '' }}
    language="th" onLanguageChange={() => {}}
    onChoiceChange={() => {}} statusLine="Test"
    counts={[
      { key: 'th', label: 'Thai', count: 7, highlighted: true },
      { key: 'en', label: 'Englisch', count: 0 },
      { key: 'es', label: 'Spanisch', count: null, detail: 'lädt' },
    ]}
    runOptions={[{ id: 'full', label: 'Alle', hint: '2 Bilder' }]}
    onStart={async () => {}} onFinished={() => {}} onDelete={async () => {}} canDelete={false} deleteLabel="Löschen" />); });
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Thai: 7');
  expect(json).toContain('Englisch: 0');
  // Noch nicht geladen — ehrlich „…“ statt einer erfundenen Zahl.
  expect(json).toContain('Spanisch: …');
  await act(async () => { tree.unmount(); });
});
