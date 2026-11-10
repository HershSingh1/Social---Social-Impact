import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlanDraftProvider, usePlanDraft } from './PlanDraftStore';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockN}` }));

const init = (key: string) => ({
  key, groupId: 'g1', experienceId: 'e1', pickId: null, date: null, start: null, end: null, endTouched: false,
  meetingPoint: 'Gate', note: '', recipients: ['u1'],
});

let store: ReturnType<typeof usePlanDraft>;
function Probe() { store = usePlanDraft(); return <Text>{store.loaded ? `loaded ${store.draft?.key ?? 'none'} ${store.draft?.clientKey ?? ''}` : 'loading'}</Text>; }

beforeEach(async () => { mockN = 0; await AsyncStorage.clear(); });

describe('plan draft store (drafts live on this phone until sent)', () => {
  it('creates a draft with a request id and resumes it for the same plan', async () => {
    await render(<PlanDraftProvider><Probe /></PlanDraftProvider>);
    await screen.findByText('loaded none ');
    let first!: ReturnType<typeof store.begin>;
    await act(async () => { first = store.begin(init('g1:e1')); });
    expect(first.clientKey).toBe('key-1');
    let again!: ReturnType<typeof store.begin>;
    await act(async () => { again = store.begin(init('g1:e1')); });
    expect(again.clientKey).toBe('key-1'); // resumed: same request id, so Retry never duplicates
    let other!: ReturnType<typeof store.begin>;
    await act(async () => { other = store.begin(init('g1:e2')); });
    expect(other.clientKey).toBe('key-2'); // a different plan gets its own
  });

  it('saves every change to the phone and restores it after a restart', async () => {
    const a = await render(<PlanDraftProvider><Probe /></PlanDraftProvider>);
    await screen.findByText('loaded none ');
    await act(async () => { store.begin(init('g1:e1')); });
    await act(async () => { store.dispatch({ type: 'patch', patch: { note: 'Bring pencils' } }); });
    expect(JSON.parse((await AsyncStorage.getItem('sq.planDraft.v1')) as string).note).toBe('Bring pencils');

    await a.unmount();
    await render(<PlanDraftProvider><Probe /></PlanDraftProvider>);
    expect(await screen.findByText('loaded g1:e1 key-1')).toBeTruthy();
    expect(store.draft?.note).toBe('Bring pencils');
  });

  it('clear() removes the saved draft', async () => {
    await render(<PlanDraftProvider><Probe /></PlanDraftProvider>);
    await screen.findByText('loaded none ');
    await act(async () => { store.begin(init('g1:e1')); });
    await act(async () => { store.clear(); });
    expect(await AsyncStorage.getItem('sq.planDraft.v1')).toBeNull();
    expect(store.draft).toBeNull();
  });
});
