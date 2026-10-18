import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FoundationsRunner } from './foundations-runner';
import { ThemedButton } from './themed-button';
import { numberWord } from '@/data/numbers';
import { hasPronunciationClip, isLanguageAvailable, playPronunciationWithStatus } from '@/lib/audio';
import type { FoundationMode } from '@/lib/foundations';
import { translate } from '@/lib/i18n';
import type { PairDirection } from '@/lib/languages/types';

jest.mock('@/lib/audio', () => ({
  hasPronunciationClip: jest.fn(async () => false),
  isLanguageAvailable: jest.fn(async () => true),
  stopPronunciation: async () => {},
  playPronunciationWithStatus: jest.fn(async () => ({ kind: 'tts', label: 'audio.systemVoiceUnchecked' })),
}));

async function render(mode: FoundationMode, direction: PairDirection): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<FoundationsRunner mode={mode} direction={direction} onExit={() => {}} />); });
  return renderer;
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAllByType(ThemedButton).find((node) => node.props.label === label);

beforeEach(() => jest.clearAllMocks());

it('zeigt die Thai-Zahlen mit Umschrift, spielt sie ab und fragt danach hörend ab', async () => {
  const renderer = await render('zahlen', 'de_to_th');
  expect(text(renderer)).toContain('หนึ่ง');
  expect(text(renderer)).toContain(numberWord('th', 1).roman!);
  const one = renderer.root.findAll((node) => node.props.accessibilityLabel === `1: ${numberWord('th', 1).text}` && node.props.onPress)[0];
  await act(async () => { one.props.onPress(); });
  expect(playPronunciationWithStatus).toHaveBeenCalledWith({ text: 'หนึ่ง', language: 'th', purpose: 'vocabulary' });

  await act(async () => { button(renderer, translate('en', 'foundations.startQuiz'))!.props.onPress(); });
  // Erste Frage nur zum Hören: abgespielt, aber die Lösung steht noch nicht da.
  expect(playPronunciationWithStatus).toHaveBeenCalledTimes(2);
  expect(text(renderer)).toContain(`${translate('en', 'foundations.questionNumber')} · ${translate('en', 'foundations.byEar')}`);
  const options = renderer.root.findAll((node) =>
    typeof node.type !== 'string' && node.props.accessibilityState?.selected === false && typeof node.props.onPress === 'function');
  expect(new Set(options.map((node) => node.props.accessibilityLabel)).size).toBe(4);
  await act(async () => { options[0].props.onPress(); });
  expect(text(renderer)).toMatch(new RegExp(`${translate('en', 'drill.correct')}|${translate('en', 'drill.wrong')}`));
  expect(button(renderer, translate('en', 'common.next'))).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('macht Hörfragen ohne Stimme zu Lesefragen', async () => {
  jest.mocked(isLanguageAvailable).mockResolvedValue(false);
  const renderer = await render('preise', 'de_to_es');
  expect(text(renderer)).toContain(translate('en', 'foundations.noVoice'));
  await act(async () => { button(renderer, translate('en', 'foundations.startQuiz'))!.props.onPress(); });
  expect(text(renderer)).toContain(`${translate('en', 'foundations.questionPrice')} · ${translate('en', 'foundations.byEye')}`);
  expect(text(renderer)).not.toContain(`· ${translate('en', 'foundations.byEar')}`);
  jest.mocked(isLanguageAvailable).mockResolvedValue(true);
  await act(async () => renderer.unmount());
});

it('zeigt das deutsche ABC mit Eszett für eine Thai-Oberfläche und liest den Buchstaben vor', async () => {
  const renderer = await render('abc', 'th_to_de');
  expect(text(renderer)).toContain('Eszett');
  expect(text(renderer)).toContain('/ɛsˈt͡sɛt/');
  const v = renderer.root.findAll((node) => node.props.accessibilityLabel === 'V: /faʊ/' && node.props.onPress)[0];
  await act(async () => { v.props.onPress(); });
  expect(playPronunciationWithStatus).toHaveBeenCalledWith({ text: 'V', language: 'de', purpose: 'general' });
  await act(async () => renderer.unmount());
});

it('Konsonanten, Vokalzeichen, Töne und Buchstabieren laufen auch ohne einen einzigen Clip', async () => {
  for (const [mode, direction] of [['konsonanten', 'de_to_th'], ['vokale', 'de_to_th'], ['toene', 'de_to_th'], ['buchstabieren', 'de_to_en']] as const) {
    const renderer = await render(mode, direction);
    expect(renderer.toJSON()).not.toBeNull();
    if (mode === 'konsonanten') expect(text(renderer)).toContain('gɔɔ'.normalize('NFC'));
    if (mode === 'toene') {
      expect(hasPronunciationClip).toHaveBeenCalled();
      // Ohne tongeprüften Clip spielt die Tonseite nie die Systemstimme.
      expect(playPronunciationWithStatus).not.toHaveBeenCalled();
    }
    await act(async () => renderer.unmount());
  }
});
