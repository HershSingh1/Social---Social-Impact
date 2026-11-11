import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button, TextField } from '..';

test('async action blocks a second tap and becomes available after completion', async () => {
  let finish!: () => void;
  const onPress = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(<Button label="Send" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState.busy).toBe(true);
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState.disabled).toBe(false);
});

test('failed action shows an error and permits retry', async () => {
  const onPress = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('offline'));
  await render(<Button label="Send" onPress={onPress} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState.disabled).toBe(false);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
  expect(onPress).toHaveBeenCalledTimes(2);
});

test('a field error never clears controlled input', async () => {
  const onChangeText = jest.fn();
  const result = await render(<TextField label="Name" value="Alex" onChangeText={onChangeText} />);
  await result.rerender(<TextField label="Name" value="Alex" onChangeText={onChangeText} error="Try again" />);
  expect(screen.getByLabelText('Name').props.value).toBe('Alex');
  expect(onChangeText).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Alex Smith');
  expect(onChangeText).toHaveBeenCalledWith('Alex Smith');
});
