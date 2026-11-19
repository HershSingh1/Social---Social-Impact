import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthContext } from '../../auth/authContext';
import { DiscoveryResults } from '../../discovery/DiscoveryResults';
import { FiltersProvider } from '../../discovery/FiltersContext';
import { MapListScreen } from '../../discovery/MapListScreen';
import { EXPERIENCES_KEY, type Experience } from '../../discovery/useExperiences';
import { takeQuizOffer } from '../offer';
import { QuizScreen } from '../QuizScreen';
import { matchingCategories, QUIZ_CARDS, saveQuiz, swipeAnswer, withInterests, type Answers } from '../quiz';

// These tests tap through all 10 cards, each tap a render. A cold or busy machine can run past Jest's 5 s default.
const SLOW = 20_000;

type Result = { data: unknown; error: { message: string } | null };
let mockOld: Result;
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => Promise.resolve(mockOld) }),
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MockMap({ children }: { children: React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return <View>{children}</View>;
  });
  return { __esModule: true, default: MapView, Marker: () => null };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));

const rows = (a: Record<string, string>): Result => ({ data: Object.entries(a).map(([category, answer]) => ({ category, answer })), error: null });
const saves = () => mockRpc.mock.calls.filter(([fn]) => fn === 'set_interests');
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const wrap = (node: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;

beforeEach(async () => {
  mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null });
  mockOld = { data: [], error: null };
  await AsyncStorage.clear();
});

test('swipe right is Yes, left is No, a short or mostly vertical drag answers nothing', () => {
  expect(swipeAnswer(120)).toBe('yes');
  expect(swipeAnswer(-120)).toBe('no');
  expect(swipeAnswer(40)).toBeNull();
  expect(swipeAnswer(120, 90)).toBeNull();
});

test('about ten cards, all real onboarding categories', () => {
  expect(QUIZ_CARDS).toHaveLength(10);
  expect(new Set(QUIZ_CARDS.map(c => c.id)).size).toBe(10);
});

test('only Yes matches; Maybe and No never do', () => {
  expect([...matchingCategories({ hiking: 'yes', museums: 'maybe', film: 'no', brunch: 'no', cocktails: 'yes' })].sort()).toEqual(['Food and drink', 'Outdoors']);
  expect(matchingCategories({ film: 'no' }).size).toBe(0);
});

const exp = (id: string, category: string): Experience => ({ id, name: id, category, description: '', lat: 30.26, lng: -97.74, area: null, image_url: null,
  timing_kind: 'flexible', hours_text: null, booking_required: false, price_kind: 'free', price_min: 0, price_max: 0 });
const LIST = [exp('swim', 'Outdoors'), exp('pot', 'Make something'), exp('hike', 'Outdoors'), exp('quiz', 'Games and trivia')];

test('matches come first and are marked; the rest keep their order; no matches changes nothing', () => {
  const sorted = withInterests(LIST, { workshops: 'yes' });
  expect(sorted.map(e => e.id)).toEqual(['pot', 'swim', 'hike', 'quiz']);
  expect(sorted.map(e => !!e.matchesInterests)).toEqual([true, false, false, false]);
  expect(withInterests(LIST, { hiking: 'maybe' })).toBe(LIST);
  expect(withInterests(LIST, undefined)).toBe(LIST);
});

test('saving keeps the old answers for chips that were not on a card', async () => {
  const merged = await saveQuiz({ coffee: 'yes', brunch: 'no' }, { brunch: 'maybe', hiking: 'yes' });
  expect(merged).toEqual({ coffee: 'yes', brunch: 'maybe', hiking: 'yes' });
  expect(mockRpc).toHaveBeenCalledWith('set_interests', { answers: merged });
});

test('the offer is made once per account', async () => {
  expect(await takeQuizOffer('u1')).toBe(true);
  expect(await takeQuizOffer('u1')).toBe(false);
  expect(await takeQuizOffer('u2')).toBe(true);
});

const show = (over: { onClose?: () => void; onDone?: () => void } = {}) =>
  render(wrap(<QuizScreen userId="u1" onClose={over.onClose ?? (() => {})} onDone={over.onDone ?? (() => {})} />));

test('intro, then cards with progress; answering all sends one set_interests with every answer', async () => {
  const onDone = jest.fn();
  await show({ onDone });
  expect(screen.getByText('Loading the quiz…')).toBeTruthy();
  expect(await screen.findByText('What are you into?')).toBeTruthy();
  expect(screen.getByText('Only you see your answers.')).toBeTruthy();
  expect(screen.queryByText('Your new answers replace your old ones.')).toBeNull();
  await press('Start the quiz');
  expect(screen.getByText('Card 1 of 10')).toBeTruthy();
  for (let i = 0; i < 10; i += 1) {
    expect(saves()).toHaveLength(0);
    await press(`Yes to ${QUIZ_CARDS[i].title}`);
  }
  expect(saves()).toHaveLength(1);
  const sent = saves()[0][1].answers as Answers;
  expect(Object.keys(sent).sort()).toEqual(QUIZ_CARDS.map(c => c.id).sort());
  expect(onDone).toHaveBeenCalled();
}, SLOW);

test('Yes, Maybe and No send their own answer; Skip leaves a card unanswered', async () => {
  await show();
  await screen.findByText('What are you into?');
  await press('Start the quiz');
  await press('Yes to Brunch');
  await press('Maybe to Cocktails');
  await press('No to Concerts');
  await press('Skip Comedy');
  for (const card of QUIZ_CARDS.slice(4)) await press(new RegExp(`^Yes to ${card.title}$`));
  expect(saves()[0][1].answers).toEqual({ brunch: 'yes', cocktails: 'maybe', concerts: 'no',
    ...Object.fromEntries(QUIZ_CARDS.slice(4).map(c => [c.id, 'yes'])) });
}, SLOW);

test('Back returns to the previous card and Skip for now closes without saving', async () => {
  const onClose = jest.fn();
  await show({ onClose });
  await screen.findByText('What are you into?');
  await press('Start the quiz');
  await press('Yes to Brunch');
  expect(screen.getByText('Card 2 of 10')).toBeTruthy();
  await press('Previous card');
  expect(screen.getByText('Card 1 of 10')).toBeTruthy();
  await press('Previous card');
  await press('Skip for now');
  expect(onClose).toHaveBeenCalled();
  expect(saves()).toHaveLength(0);
});

test('retaking says the new answers replace the old ones, and old answers for other chips are kept', async () => {
  mockOld = rows({ coffee: 'yes', brunch: 'no' });
  await show();
  expect(await screen.findByText('Your new answers replace your old ones.')).toBeTruthy();
  await press('Start the quiz');
  for (const card of QUIZ_CARDS) await press(new RegExp(`^Maybe to ${card.title}$`));
  const sent = saves()[0][1].answers as Answers;
  expect(sent.coffee).toBe('yes');
  expect(sent.brunch).toBe('maybe');
}, SLOW);

test('a failed save keeps every answer, says so, and Try again sends the same answers', async () => {
  const onDone = jest.fn();
  await show({ onDone });
  await screen.findByText('What are you into?');
  await press('Start the quiz');
  for (const card of QUIZ_CARDS.slice(0, 9)) await press(new RegExp(`^Yes to ${card.title}$`));
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await press(/^No to Workshops$/);
  expect(await screen.findByText(/Couldn’t save your answers\. All 10 are still here/)).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
  await press('Try again');
  expect(saves()).toHaveLength(2);
  expect(saves()[1][1]).toEqual(saves()[0][1]);
  expect((saves()[1][1].answers as Answers).workshops).toBe('no');
  expect(onDone).toHaveBeenCalled();
}, SLOW);

test('if the old answers cannot load, the quiz says so and skipping still works', async () => {
  const onClose = jest.fn();
  mockOld = { data: null, error: { message: 'boom' } };
  await show({ onClose });
  expect(await screen.findByText('Couldn’t load the quiz. Check your connection and try again.')).toBeTruthy();
  await press('Skip for now');
  expect(onClose).toHaveBeenCalled();
});

const signedIn = (node: ReactNode) => <AuthContext.Provider value={{ status: 'ready', session: { user: { id: 'u1' } } as never,
  onboarding: { step: 'done', needsUsername: false }, refresh: async () => {} }}>{node}</AuthContext.Provider>;

test('Explore puts the person’s own matches first, and skipping the quiz changes nothing', async () => {
  mockOld = rows({ workshops: 'yes' });
  const seen: string[][] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(EXPERIENCES_KEY, LIST);
  await render(wrap(signedIn(<FiltersProvider><DiscoveryResults>{r => { seen.push(r.map(e => e.id)); return null; }}</DiscoveryResults></FiltersProvider>), client));
  await waitFor(() => expect(seen.at(-1)).toEqual(['pot', 'swim', 'hike', 'quiz']));

  seen.length = 0; mockOld = { data: [], error: null };
  const other = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  other.setQueryData(EXPERIENCES_KEY, LIST);
  await render(wrap(signedIn(<FiltersProvider><DiscoveryResults>{r => { seen.push(r.map(e => e.id)); return null; }}</DiscoveryResults></FiltersProvider>), other));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(seen.at(-1)).toEqual(['swim', 'pot', 'hike', 'quiz']);
});

test('the List labels matching rows "Matches your interests" and no others', async () => {
  mockOld = rows({ workshops: 'yes' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(EXPERIENCES_KEY, LIST);
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    {wrap(signedIn(<FiltersProvider><MapListScreen onOpen={() => {}} userId="u1" /></FiltersProvider>), client)}
  </SafeAreaProvider>);
  await press('Show list');
  await waitFor(() => expect(screen.getAllByText('Matches your interests')).toHaveLength(1));
});
