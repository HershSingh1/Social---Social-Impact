import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DiscoveryScreen } from './DiscoveryScreen';
import { locateOnce } from './locate';
import { CATALOG } from './testData';

const mockRouter = { push: jest.fn() };
let mockQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('./hooks', () => ({ useExperiences: () => mockQuery }));
jest.mock('./locate', () => ({
  locateOnce: jest.fn(),
  DEFAULT_REGION: { latitude: 30.2672, longitude: -97.7431, latitudeDelta: 0.14, longitudeDelta: 0.14 },
}));
jest.mock('react-native-maps', () => {
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View testID="map">{children}</View>,
    Marker: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`pin ${title}`} onPress={onPress} />
    ),
  };
});

const ready = (data = CATALOG) => ({ data, isPending: false, isError: false, refetch: jest.fn() });
const pins = () => screen.queryAllByLabelText(/^pin /).map((p) => p.props.accessibilityLabel);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (name: RegExp) => fireEvent.press(screen.getByRole('radio', { name })); // sheet options are radios

beforeEach(() => { jest.clearAllMocks(); mockQuery = ready(); });

describe('Discovery: Map, List, search and filters (P0-04, P0-05)', () => {
  it('opens on the map with one pin per experience and a count', async () => {
    await render(<DiscoveryScreen />);
    expect(pins().sort()).toEqual(['pin Clay and conversation', 'pin Sketch and stroll', 'pin Tuesday trivia']);
    expect(screen.getByText('3 experiences in Austin')).toBeTruthy();
  });

  it('Activity filter narrows the results', async () => {
    await render(<DiscoveryScreen />);
    await press(/^Activity/);
    await choose(/^Make something/);
    expect(pins()).toEqual(['pin Clay and conversation']);
    expect(screen.getByText('1 experience in Austin')).toBeTruthy();
  });

  it('Under $25 keeps free and unknown-price experiences and hides the $38 one', async () => {
    await render(<DiscoveryScreen />);
    await press(/^Price/);
    await choose(/^Under \$25/);
    expect(pins().sort()).toEqual(['pin Sketch and stroll', 'pin Tuesday trivia']);
  });

  it('search waits 300 ms after typing stops, then matches name, area or category', async () => {
    jest.useFakeTimers();
    try {
      await render(<DiscoveryScreen />);
      await fireEvent.changeText(screen.getByLabelText('Search Austin experiences'), 'clay');
      expect(pins()).toHaveLength(3); // not yet
      await act(async () => { jest.advanceTimersByTime(300); });
      expect(pins()).toEqual(['pin Clay and conversation']);
      await fireEvent.changeText(screen.getByLabelText('Search Austin experiences'), 'hyde');
      await act(async () => { jest.advanceTimersByTime(300); });
      expect(pins()).toEqual(['pin Tuesday trivia']);
    } finally { jest.useRealTimers(); }
  });

  it('shows "Nothing matches here" with Clear filters, which restores everything', async () => {
    await render(<DiscoveryScreen />);
    await press(/^Activity/);
    await choose(/^Outdoors/);
    expect(await screen.findByText('Nothing matches here')).toBeTruthy();
    await press('Clear filters');
    expect(pins()).toHaveLength(3);
  });

  it('selecting a pin shows the preview card; tapping the card opens Detail', async () => {
    await render(<DiscoveryScreen />);
    await press('pin Clay and conversation');
    const card = screen.getByRole('button', { name: /Clay and conversation, Make something, East Austin, \$38, exact price/ });
    expect(screen.getByText('Booking required')).toBeTruthy();
    await fireEvent.press(card);
    expect(mockRouter.push).toHaveBeenCalledWith('/experience/clay');
  });

  it('keeps the selected experience when switching Map to List and back', async () => {
    await render(<DiscoveryScreen />);
    await press('pin Sketch and stroll');
    await fireEvent.press(screen.getByRole('tab', { name: 'List view' }));
    expect(screen.getByRole('button', { name: /Sketch and stroll.*Selected/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clay and conversation/ }).props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByRole('tab', { name: 'Map view' }));
    expect(screen.getByRole('button', { name: /Sketch and stroll, Art and walks/ })).toBeTruthy(); // preview card again
  });

  it('list and map share the same filtered results', async () => {
    await render(<DiscoveryScreen />);
    await press(/^Price/);
    await choose(/^Free/);
    await fireEvent.press(screen.getByRole('tab', { name: 'List view' }));
    expect(screen.getByText('Sketch and stroll')).toBeTruthy();
    expect(screen.queryByText('Clay and conversation')).toBeNull();
  });

  it('location denied: says so, stays on downtown, and search and filters still work', async () => {
    (locateOnce as jest.Mock).mockResolvedValue({ status: 'denied' });
    await render(<DiscoveryScreen />);
    expect(locateOnce).not.toHaveBeenCalled(); // never asked at launch
    await press(/^Locate me/);
    expect(await screen.findByText(/map stays on downtown Austin/)).toBeTruthy();
    await press(/^Activity/);
    await choose(/^Make something/);
    expect(pins()).toEqual(['pin Clay and conversation']);
    await fireEvent.press(screen.getByRole('tab', { name: 'List view' }));
    expect(screen.getByText('Clay and conversation')).toBeTruthy();
  });

  it('location granted: no warning', async () => {
    (locateOnce as jest.Mock).mockResolvedValue({ status: 'granted', latitude: 30.3, longitude: -97.7 });
    await render(<DiscoveryScreen />);
    await press(/^Locate me/);
    await waitFor(() => expect(locateOnce).toHaveBeenCalled());
    expect(screen.queryByText(/Location is off/)).toBeNull();
  });

  it('Loading, Error (retry) and stale states', async () => {
    mockQuery = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    const { rerender } = await render(<DiscoveryScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();

    const refetch = jest.fn();
    mockQuery = { data: undefined, isPending: false, isError: true, refetch };
    await rerender(<DiscoveryScreen />);
    expect(screen.getByText("Couldn't load experiences near you.")).toBeTruthy();
    await press('Try again');
    expect(refetch).toHaveBeenCalled();

    mockQuery = { data: CATALOG, isPending: false, isError: true, refetch };
    await rerender(<DiscoveryScreen />);
    expect(pins()).toHaveLength(3); // old data stays on screen
    expect(screen.getByText(/Couldn't refresh/)).toBeTruthy();
  });
});
