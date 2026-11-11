import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Avatar, AvatarStack, Button, Chip, Sheet, Tag } from '..';
import { inset, minTap, radius, size } from '../theme';

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, number>;

test('a failed action shows the message the feature passes in', async () => {
  const onPress = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('closed'));
  await render(<Button label="Vote" onPress={onPress} errorMessage={error => `Voting closed: ${(error as Error).message}`} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vote' })));
  expect(screen.getByRole('alert').props.children).toBe('Voting closed: closed');
});

test('a fixed error message replaces the default one and clears on the next try', async () => {
  const onPress = jest.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
  await render(<Button label="Save" onPress={onPress} errorMessage="This plan changed" />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Save' })));
  expect(screen.getByRole('alert').props.children).toBe('This plan changed');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Save' })));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('small buttons and chips look 36 and 34 pt tall but keep a 44 pt tap area', async () => {
  await render(<><Button label="Small" size="small" onPress={() => {}} /><Chip label="Filter" onPress={() => {}} /></>);
  for (const node of [screen.getByRole('button', { name: 'Small' }), screen.getByRole('checkbox', { name: 'Filter' })]) {
    expect(flat(node).minHeight).toBeGreaterThanOrEqual(minTap);
    expect(flat(node).minWidth).toBeGreaterThanOrEqual(minTap);
  }
});

test('Figma measurements are in the theme', () => {
  expect([size.buttonLarge, size.buttonSmall, size.chip, size.tag, size.field]).toEqual([52, 36, 34, 24, 48]);
  expect([radius.xs, radius.sm, radius.md, radius.lg, radius.xl]).toEqual([6, 10, 12, 16, 20]);
  expect(inset.field).toBe(14);
  expect(Object.values(size.avatar)).toEqual([24, 32, 40, 56, 88]);
});

test('an avatar is exactly its size, with no padding around the image', async () => {
  await render(<Avatar name="Alex" uri="https://example.com/a.png" size="lg" />);
  const style = flat(screen.getByRole('image', { name: 'Alex' }));
  expect([style.width, style.height, style.borderRadius]).toEqual([56, 56, 28]);
  expect(style.padding).toBeUndefined();
});

test('an avatar without a picture shows the first letter', async () => {
  await render(<Avatar name="jordan" />);
  expect(screen.getByText('J')).toBeTruthy();
});

test('tags keep their words in every variant', async () => {
  await render(<><Tag label="Awaiting reply" /><Tag label="Going" variant="dark" /><Tag label="Booking required" variant="outline" /></>);
  for (const text of ['Awaiting reply', 'Going', 'Booking required']) expect(screen.getByText(text)).toBeTruthy();
});

test('tapping the dimmed area closes a sheet', async () => {
  const onClose = jest.fn();
  await render(<Sheet title="Example" visible onClose={onClose}><Tag label="Inside" /></Sheet>);
  await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a sheet still closes from its Close button', async () => {
  const onClose = jest.fn();
  await render(<Sheet title="Example" visible onClose={onClose}><Tag label="Inside" /></Sheet>);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Close Example' })));
  expect(onClose).toHaveBeenCalled();
});

test('stacked avatars overlap like the Figma stacks: 7 pt on 24 pt, 10 pt on 32 pt', async () => {
  const people = [{ id: '1', name: 'Alex' }, { id: '2', name: 'Jordan' }];
  const result = await render(<AvatarStack people={people} size="xs" />);
  const margins = (root: typeof result) => root.toJSON() && JSON.stringify(root.toJSON());
  expect(margins(result)).toContain('"marginLeft":-7');
  await result.rerender(<AvatarStack people={people} size="sm" />);
  expect(margins(result)).toContain('"marginLeft":-10');
});

test('screen content sits 20 pt from the sides', () => {
  expect(inset.screen).toBe(20);
});
