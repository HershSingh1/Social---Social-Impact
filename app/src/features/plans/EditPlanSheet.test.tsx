import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EditPlanSheet } from './EditPlanSheet';
import { editPlan } from './api';
import { planDetail } from './testData';
import type { PlanDetail } from './api';

jest.mock('./api', () => ({ editPlan: jest.fn() }));

// 2:00 PM to 3:30 PM Austin time on a fixed future day (CDT, UTC-5)
const FIXED_START = '2030-06-15T19:00:00.000Z';
const d = (): PlanDetail => {
  const base = planDetail();
  return {
    ...base,
    current: { ...base.current, start_at: FIXED_START, end_at: '2030-06-15T20:30:00.000Z' },
    rsvps: [
      { user_id: 'maya', name: 'Maya', isGuest: false, status: 'going', revision: 1 },
      { user_id: 'jordan', name: 'Jordan', isGuest: true, status: 'going', revision: 1 },
      { user_id: 'sam', name: 'Sam', isGuest: true, status: 'going', revision: 1 },
      { user_id: 'priya', name: 'Priya', isGuest: false, status: 'cant_go', revision: 1 },
    ],
  };
};
const onClose = jest.fn();
const onSaved = jest.fn();
const renderIt = () => render(<EditPlanSheet d={d()} visible onClose={onClose} onSaved={onSaved} />);

beforeEach(() => jest.resetAllMocks());

describe('Edit plan (P0-14)', () => {
  it('a note change is minor: no reconfirmation, and only the note is sent', async () => {
    (editPlan as jest.Mock).mockResolvedValue({ material: false, changed: true, revision: 1, needs_reconfirm: 0 });
    await renderIt();
    expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState.disabled).toBe(true); // nothing changed yet
    await fireEvent.changeText(screen.getByLabelText(/^Note to the group/), 'Bring pencils');
    expect(screen.getByText("A note change doesn't need anyone to reconfirm.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(editPlan).toHaveBeenCalledWith('plan1', { note: 'Bring pencils' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a meeting point change is material and says how many Going invitees must reconfirm (not the organizer, not Can\'t go)', async () => {
    await renderIt();
    await fireEvent.changeText(screen.getByLabelText('Meeting point'), 'Stone footbridge');
    expect(screen.getByText('2 Going invitees will need to reconfirm.')).toBeTruthy();
  });

  it('moving the start one hour later keeps the length of the outing and sends both times', async () => {
    (editPlan as jest.Mock).mockResolvedValue({ material: true, changed: true, revision: 2, needs_reconfirm: 2 });
    await renderIt();
    await fireEvent.press(screen.getByRole('button', { name: '2:00 PM' }));
    await fireEvent.press(screen.getByRole('radio', { name: '3:00 PM' }));
    expect(screen.getByText('2 Going invitees will need to reconfirm.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '4:30 PM' })).toBeTruthy(); // end moved with it (90 minutes)
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(editPlan).toHaveBeenCalledWith('plan1', { start_local: '2030-06-15T15:00:00', end_local: '2030-06-15T16:30:00' }));
    expect(onSaved).toHaveBeenCalledWith({ material: true, changed: true, revision: 2, needs_reconfirm: 2 });
  });

  it('refuses an end before the start under the field and does not send', async () => {
    await renderIt();
    await fireEvent.press(screen.getByRole('button', { name: '3:30 PM' }));
    await fireEvent.press(screen.getByRole('radio', { name: '1:00 PM' }));
    expect(await screen.findByText(/End time must be after the start time/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState.disabled).toBe(true);
    expect(editPlan).not.toHaveBeenCalled();
  });

  it('shows the server refusal and keeps the sheet open', async () => {
    (editPlan as jest.Mock).mockRejectedValue({ message: 'plan_started' });
    await renderIt();
    await fireEvent.changeText(screen.getByLabelText('Meeting point'), 'Elsewhere');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/already started/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Meeting point').props.value).toBe('Elsewhere'); // typed text kept
  });

  it('a plan that runs past midnight can still get a note change', async () => {
    (editPlan as jest.Mock).mockResolvedValue({ material: false, changed: true, revision: 1, needs_reconfirm: 0 });
    const base = d();
    // 11:00 PM to 12:30 AM Austin time (CDT): the end is on the next day
    const late: PlanDetail = { ...base, current: { ...base.current, start_at: '2030-06-16T04:00:00.000Z', end_at: '2030-06-16T05:30:00.000Z' } };
    await render(<EditPlanSheet d={late} visible onClose={onClose} onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByLabelText(/^Note to the group/), 'Bring a jacket');
    expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(editPlan).toHaveBeenCalledWith('plan1', { note: 'Bring a jacket' }));
  });
});
