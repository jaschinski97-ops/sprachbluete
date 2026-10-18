import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ReviewScreen from '@/app/review';
import type { ConversationSituation } from '@/lib/conversation/types';
import { translate, type TranslationKey } from '@/lib/i18n';
import { ThemedButton } from './themed-button';

jest.mock('expo-audio', () => ({}));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({ direction: 'de_to_th', mode: 'path' }),
  useRouter: () => ({ setParams: jest.fn() }),
}));
jest.mock('@/lib/profile', () => ({
  loadProfile: async () => ({ language: 'th' }),
  setReviewSpot: async () => ({ language: 'th' }),
}));

const scene: ConversationSituation = {
  id: 'greeting-A1-de_to_th-001', topic: 'greeting', level: 'A1', direction: 'de_to_th', title: 'Erstes Kennenlernen',
  setting: '', scriptTurns: [{ speaker: 'learner', thai: 'สวัสดีครับ', roman: 'sà-wàt-dii khráp', german: 'Hallo' }],
  corrections: [{ issue: 'Höflichkeitspartikel', explanation: '' }], generatedAt: 1, modelUsed: 'test',
};
jest.mock('@/lib/repository', () => ({
  loadSituations: async () => [scene],
  readMeta: async (_key: string, fallback: unknown) => fallback,
  writeMeta: async () => {},
  rateCard: jest.fn(),
}));

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const t = (key: TranslationKey) => translate('en', key);

it('stellt Kapitel 0 „Grundlagen“ vor Kapitel 1 und öffnet seine sieben Thai-Schritte', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ReviewScreen />); });
  expect(text(renderer)).toContain(t('foundations.title'));
  expect(text(renderer)).toContain(t('foundations.introThai'));
  const open = renderer.root.findAllByType(ThemedButton).find((node) => node.props.label === t('path.open'))!;
  await act(async () => open.props.onPress());
  for (const [index, key] of (['foundations.numbers', 'foundations.prices', 'foundations.consonants', 'drill.konsonantenklasse',
    'foundations.vowels', 'foundations.tones', 'drill.tone'] as const).entries()) {
    expect(text(renderer)).toContain(`${index + 1}. ${t(key)}`);
  }
  await act(async () => renderer.unmount());
});

it('beginnt ein Dialogkapitel mit dem Dialog, nicht mit der Regel (Nutzerentscheidung 18.10.2026)', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ReviewScreen />); });
  const row = renderer.root.findAll((node) => typeof node.type !== 'string' && node.props.accessibilityRole === 'button'
    && typeof node.props.onPress === 'function' && JSON.stringify(node.props.accessibilityState) === '{"selected":false}')[0];
  await act(async () => row.props.onPress());
  const open = renderer.root.findAllByType(ThemedButton).find((node) => node.props.label === t('path.open'))!;
  await act(async () => open.props.onPress());
  const steps = text(renderer);
  expect(steps).toContain(`1. ${t('mode.sentenceListening')}`);
  expect(steps).toContain(`2. ${t('mode.lesestoffe')}`);
  expect(steps).toContain(`3. ${t('mode.cards')}`);
  expect(steps).toContain(`4. ${t('skill.grammatik')}`);
  await act(async () => renderer.unmount());
});
