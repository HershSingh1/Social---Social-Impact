import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';
import { InviteFromContacts } from '../InviteFromContacts';
import { inviteMessage } from '../message';

type FakeContact = { getFullName: () => Promise<string>; getPhones: () => Promise<{ number?: string }[]> };
const mockPick = jest.fn<() => Promise<FakeContact | null>>();
jest.mock('expo-contacts', () => ({ Contact: { presentPicker: () => mockPick() } }));
let mockSmsOk: boolean;
const mockSend = jest.fn<(to: string[], text: string) => Promise<{ result: string }>>();
jest.mock('expo-sms', () => ({ isAvailableAsync: async () => mockSmsOk, sendSMSAsync: (to: string[], text: string) => mockSend(to, text) }));
const mockCopy = jest.fn<(s: string) => Promise<boolean>>();
jest.mock('expo-clipboard', () => ({ setStringAsync: (s: string) => mockCopy(s) }));

const MESSAGE = inviteMessage('Friday Crew', 'K7Q2MX');
const contact = (name: string, numbers: string[]): FakeContact => ({ getFullName: async () => name, getPhones: async () => numbers.map(number => ({ number })) });
const show = () => render(<InviteFromContacts message={MESSAGE} code="K7Q2MX" />);
const open = async () => { await show(); await fireEvent.press(screen.getByLabelText('Invite from contacts')); };

beforeEach(() => {
  mockPick.mockReset(); mockSend.mockReset().mockResolvedValue({ result: 'sent' }); mockCopy.mockReset().mockResolvedValue(true);
  mockSmsOk = true;
});

test('the message is fixed and carries the group name and code', () => {
  expect(MESSAGE).toBe('Join Friday Crew on Sidequest with code K7Q2MX. Open Sidequest, tap Join with code and enter it.');
});

test('nothing asks for contacts until the button is tapped', async () => {
  await show();
  expect(mockPick).not.toHaveBeenCalled();
});

test('a chosen contact shows under To with the message preview, and Send opens Messages with their number', async () => {
  mockPick.mockResolvedValueOnce(contact('Priya Shah', ['+15125550101']));
  await open();
  expect(await screen.findByText('TO (1)')).toBeTruthy();
  expect(screen.getByText('Priya Shah')).toBeTruthy();
  expect(screen.getByText(MESSAGE)).toBeTruthy();
  expect(screen.getByText(/Your contacts stay on this phone/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Send in Messages'));
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith(['+15125550101'], MESSAGE));
  await waitFor(() => expect(screen.queryByText('TO (1)')).toBeNull());
});

test('more people can be added, the same person is not added twice, and one can be removed', async () => {
  mockPick.mockResolvedValueOnce(contact('Priya Shah', ['+15125550101']))
    .mockResolvedValueOnce(contact('Alex Lee', ['+15125550102']))
    .mockResolvedValueOnce(contact('Alex Lee', ['+15125550102']));
  await open();
  await screen.findByText('TO (1)');
  await fireEvent.press(screen.getByLabelText('Add another person'));
  expect(await screen.findByText('TO (2)')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Add another person'));
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(3));
  expect(screen.getByText('TO (2)')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove Priya Shah'));
  expect(await screen.findByText('TO (1)')).toBeTruthy();
  expect(screen.queryByText('Priya Shah')).toBeNull();
});

test('closing the picker without choosing changes nothing and sends nothing', async () => {
  mockPick.mockResolvedValueOnce(null);
  await open();
  await waitFor(() => expect(mockPick).toHaveBeenCalled());
  expect(screen.queryByText('TO (0)')).toBeNull();
  expect(mockSend).not.toHaveBeenCalled();
});

test('a contact with no phone number is named, not texted', async () => {
  mockPick.mockResolvedValueOnce(contact('Sam Ortiz', []));
  await open();
  expect(await screen.findByText('Sam Ortiz has no phone number, so Sidequest can’t text them.')).toBeTruthy();
  expect(screen.getByText('TO (0)')).toBeTruthy();
  expect(screen.getByLabelText('Send in Messages').props.accessibilityState.disabled).toBe(true);
});

test('Messages cancelled or failing keeps the preview and says Didn’t send', async () => {
  mockPick.mockResolvedValueOnce(contact('Priya Shah', ['+15125550101']));
  mockSend.mockResolvedValueOnce({ result: 'cancelled' });
  await open();
  await fireEvent.press(await screen.findByLabelText('Send in Messages'));
  expect(await screen.findByText('Didn’t send. Try again.')).toBeTruthy();
  expect(screen.getByText('TO (1)')).toBeTruthy();
});

test('no Messages on this device: the primary button is replaced and Share another way still works', async () => {
  mockSmsOk = false;
  mockPick.mockResolvedValueOnce(contact('Priya Shah', ['+15125550101']));
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await open();
  expect(await screen.findByText('Messages isn’t available on this device.')).toBeTruthy();
  expect(screen.queryByLabelText('Send in Messages')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Share another way'));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: MESSAGE }));
});

test('contacts denied: Copy code and Share still work and iPhone Settings opens, with no dead end', async () => {
  mockPick.mockRejectedValueOnce(new Error('permission denied'));
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await open();
  expect(await screen.findByText(/Contacts are off for Sidequest/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Copy code'));
  await waitFor(() => expect(mockCopy).toHaveBeenCalledWith('K7Q2MX'));
  expect(await screen.findByText('Code copied.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Share'));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: MESSAGE }));
  await fireEvent.press(screen.getByLabelText('Open iPhone Settings'));
  await waitFor(() => expect(settings).toHaveBeenCalled());
  expect(mockSend).not.toHaveBeenCalled();
});

test('Copy message copies the message text', async () => {
  mockPick.mockResolvedValueOnce(contact('Priya Shah', ['+15125550101']));
  await open();
  await fireEvent.press(await screen.findByLabelText('Copy message'));
  await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(MESSAGE));
  await act(async () => {});
});
