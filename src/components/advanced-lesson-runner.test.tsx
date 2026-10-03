import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { AdvancedLessonRunner } from './advanced-lesson-runner';
import { ThemedButton } from './themed-button';
import { ADVANCED_LESSONS } from '@/data/advanced-lessons';
import { translate } from '@/lib/i18n';
import { recordDrill } from '@/lib/review-log';

jest.mock('@/lib/repository', () => ({ readMeta: async (_key: string, fallback: unknown) => fallback, writeMeta: jest.fn(async () => {}) }));
jest.mock('@/lib/review-log', () => ({ recordDrill: jest.fn(async () => {}) }));
jest.mock('@/lib/audio', () => ({ hasPronunciationClip: async () => false, isLanguageAvailable: async () => true, stopPronunciation: async () => {}, playPronunciationWithStatus: async () => ({ kind: 'tts' }) }));

it('records each comprehension answer once, without scoring free writing or completion', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AdvancedLessonRunner direction="th_to_de" onExit={() => {}} />); });
  const press = async (key: Parameters<typeof translate>[1]) => {
    const button = renderer.root.findAllByType(ThemedButton).find(node => node.props.label === translate('en', key));
    expect(button).toBeTruthy();
    await act(async () => { button!.props.onPress(); });
  };
  for (let i = 0; i < 3; i++) await press('common.next');
  for (let i = 0; i < 3; i++) {
    const option = renderer.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.disabled === false)[ADVANCED_LESSONS.de.questions[i].correctIndex];
    await act(async () => { option.props.onPress(); });
    const next = renderer.root.findAllByType(ThemedButton).find(node => node.props.label === translate('en', 'common.next'))!;
    await act(async () => { next.props.onPress(); next.props.onPress(); });
  }
  expect(recordDrill).toHaveBeenCalledTimes(3);
  expect(recordDrill).toHaveBeenLastCalledWith(true, expect.any(Number), undefined, 'advanced', 'th_to_de');
  await press('common.next');
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText('Mein lokaler Übungstext.'));
  await press('advanced.complete');
  expect(recordDrill).toHaveBeenCalledTimes(3);
  await act(async () => renderer.unmount());
});
