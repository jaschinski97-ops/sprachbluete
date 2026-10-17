import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ReviewScreen from '@/app/review';
import { rateCard } from '@/lib/repository';
import { translate } from '@/lib/i18n';
import { ThemedButton } from './themed-button';

jest.mock('expo-audio', () => ({}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({ direction: 'en_to_de', mode: 'cards' }),
  useRouter: () => ({ setParams: jest.fn() }),
}));
jest.mock('@/lib/profile', () => ({
  loadProfile: async () => ({ language: 'de' }),
  setReviewSpot: async () => ({ language: 'de' }),
}));
jest.mock('@/lib/review-session', () => ({
  directionLabel: () => 'German',
  buildReviewQueue: async () => [{ entry: { id: 'apple', language: 'de', term: 'Apfel', german: 'Apfel', syllables: [], translations: { en: 'apple' } }, card: { vocabId: 'apple' }, bridgeEntry: null }],
}));
jest.mock('@/lib/repository', () => ({ rateCard: jest.fn(), readMeta: async (_key: string, fallback: unknown) => fallback }));
jest.mock('./flashcard', () => ({ Flashcard: () => null }));

it('keeps the same revealed card after a failed save, unlocks ratings, and advances only after a successful retry', async () => {
  jest.mocked(rateCard).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce({} as never);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ReviewScreen />); });
  const reveal = renderer.root.findAllByType(ThemedButton).find(node => node.props.label === translate('en', 'card.reveal'))!;
  await act(async () => reveal.props.onPress());
  const rating = () => renderer.root.findAll(node => node.props.accessibilityLabel === translate('en', 'rating.a11y', { label: translate('en', 'rating.good') }))[0];
  await act(async () => { await rating().props.onPress(); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Disk full');
  expect(rating().props.disabled).toBe(false);
  expect(JSON.stringify(renderer.toJSON())).not.toContain(translate('en', 'cards.done'));
  await act(async () => { await rating().props.onPress(); });
  expect(rateCard).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(renderer.toJSON())).toContain(translate('en', 'cards.done'));
  await act(async () => renderer.unmount());
});

it('zeigt „Nochmal“-Karten in derselben Runde erneut, ohne sie ein zweites Mal zu bewerten (Nutzertest 17.10.2026)', async () => {
  jest.mocked(rateCard).mockReset().mockResolvedValue({} as never);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ReviewScreen />); });
  const reveal = () => renderer.root.findAllByType(ThemedButton).find(node => node.props.label === translate('en', 'card.reveal'))!;
  const rating = (key: 'rating.again' | 'rating.good') =>
    renderer.root.findAll(node => node.props.accessibilityLabel === translate('en', 'rating.a11y', { label: translate('en', key) }))[0];
  const text = () => JSON.stringify(renderer.toJSON());

  await act(async () => reveal().props.onPress());
  await act(async () => { await rating('rating.again').props.onPress(); });
  // Dieselbe Karte kommt als Wiederholung zurück, statt dass die Runde endet.
  expect(text()).not.toContain(translate('en', 'cards.done'));
  expect(text()).toContain(translate('en', 'cards.repeatNote'));
  await act(async () => reveal().props.onPress());
  await act(async () => { await rating('rating.good').props.onPress(); });
  expect(rateCard).toHaveBeenCalledTimes(1);
  expect(text()).toContain(translate('en', 'cards.done'));
  expect(text()).toContain(translate('en', 'cards.summaryRated', { rated: 1, again: 1 }));
  await act(async () => renderer.unmount());
});
