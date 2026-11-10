import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue (search updates after 300 ms of no typing)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for typing to stop', async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useDebouncedValue(v, 300), { initialProps: { v: '' } });
    await rerender({ v: 'c' });
    await act(async () => { jest.advanceTimersByTime(200); });
    await rerender({ v: 'cl' });
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(result.current).toBe(''); // still typing
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(result.current).toBe('cl');
  });
});
