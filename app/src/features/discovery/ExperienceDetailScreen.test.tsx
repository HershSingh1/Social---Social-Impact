import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ExperienceDetailScreen } from './ExperienceDetailScreen';
import { CLAY, SKETCH, TRIVIA, exp } from './testData';

const mockRouter = { replace: jest.fn() };
let mockQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, Stack: { Screen: () => null } }));
jest.mock('./hooks', () => ({ useExperience: () => mockQuery }));

const ready = (data: unknown) => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });

beforeEach(() => { jest.clearAllMocks(); mockQuery = ready(SKETCH); });

describe('Experience detail (P0-06)', () => {
  it('shows every field for a flexible, free experience with no empty labels', async () => {
    await render(<ExperienceDetailScreen id="sketch" />);
    expect(screen.getByText('Sketch and stroll')).toBeTruthy();
    expect(screen.getByText('Art and walks')).toBeTruthy();
    expect(screen.getByText('A test experience.')).toBeTruthy();
    expect(screen.getByText('1 hr 30 min')).toBeTruthy();
    expect(screen.getByText('Shoal Creek')).toBeTruthy();
    expect(screen.getByText('Meet at: Benches at the W 3rd St trailhead')).toBeTruthy();
    expect(screen.getByText('Price, free')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Flexible hours')).toBeTruthy();
    expect(screen.getByText('Open daily 9 AM to 5 PM')).toBeTruthy();
    expect(screen.getByText('Pick any time within these hours')).toBeTruthy();
    expect(screen.getByText('PLACEHOLDER: test (not a checked listing). Checked on Nov 1, 2026.')).toBeTruthy();
    expect(screen.getByText('No booking needed.')).toBeTruthy();
  });

  it('fixed sessions show as chips with the rule; exact price; booking notice and provider link', async () => {
    mockQuery = ready(CLAY);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<ExperienceDetailScreen id="clay" />);
    expect(screen.getByText('Fixed sessions')).toBeTruthy();
    expect(screen.getByText('Sat 10:00 AM')).toBeTruthy();
    expect(screen.getByText('Sat 1:00 PM')).toBeTruthy();
    expect(screen.getByText('Plans must use one of these sessions')).toBeTruthy();
    expect(screen.getByText('$38 per person')).toBeTruthy();
    expect(screen.getByText('Price, exact price')).toBeTruthy();
    expect(screen.getByText('Booking required. Going here does not reserve a spot.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Book with example.com' }));
    expect(open).toHaveBeenCalledWith('https://www.example.com/book/clay');
  });

  it('says so when the booking page cannot be opened', async () => {
    mockQuery = ready(CLAY);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    await render(<ExperienceDetailScreen id="clay" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Book with example.com' }));
    expect(await screen.findByText(/Couldn't open the booking page/)).toBeTruthy();
  });

  it('unknown price and unknown hours have their own wording', async () => {
    mockQuery = ready(TRIVIA);
    await render(<ExperienceDetailScreen id="trivia" />);
    expect(screen.getByText('Price unknown. Check the source.')).toBeTruthy();
    expect(screen.getByText('Hours unknown')).toBeTruthy();
  });

  it('estimated prices say they are estimates', async () => {
    mockQuery = ready(exp({ id: 'e', name: 'Swim', price_kind: 'estimated', price_min: 5, price_max: 9 }));
    await render(<ExperienceDetailScreen id="e" />);
    expect(screen.getByText('About $5 to $9')).toBeTruthy();
    expect(screen.getByText('Estimated. Actual cost may differ.')).toBeTruthy();
  });

  it('a removed or missing listing says it was removed', async () => {
    mockQuery = ready(exp({ status: 'removed' }));
    const { rerender } = await render(<ExperienceDetailScreen id="x" />);
    expect(screen.getByText('This listing was removed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to map' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');

    mockQuery = ready(null);
    await rerender(<ExperienceDetailScreen id="x" />);
    expect(screen.getByText('This listing was removed')).toBeTruthy();
  });

  it('loading and error states', async () => {
    mockQuery = { data: undefined, isPending: true, isError: false, isRefetching: false, refetch: jest.fn() };
    const { rerender } = await render(<ExperienceDetailScreen id="x" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    mockQuery = { data: undefined, isPending: false, isError: true, isRefetching: false, refetch: jest.fn() };
    await rerender(<ExperienceDetailScreen id="x" />);
    expect(screen.getByText("Couldn't load this experience.")).toBeTruthy();
  });
});
