import { afterEach, expect, jest, test } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import RootLayout from '../../../app/_layout';
import DevLayout from '../../../app/dev/_layout';

// The real root layout, signed in, with fonts loaded; only the route screens are stand-ins.
jest.mock('../../../ui/fonts', () => ({ useAppFonts: () => [true, null] }));
jest.mock('../../auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  AuthGate: ({ children }: { children: (status: string) => ReactNode }) => children('ready'),
  useAuth: () => ({ session: null }),
}));
jest.mock('../../notifications', () => ({ NotificationHost: () => null }));

const routes = {
  _layout: RootLayout,
  '(tabs)/index': () => <Text>Home</Text>,
  'dev/_layout': DevLayout,
  'dev/ui-kit': () => <Text>UI kit</Text>,
  'dev/filters': () => <Text>Filters demo</Text>,
};

const wasDev = __DEV__;
const setDev = (on: boolean) => { Object.assign(globalThis, { __DEV__: on }); };
afterEach(() => setDev(wasDev));

test('development build: both developer screens open', async () => {
  setDev(true);
  await renderRouter(routes, { initialUrl: '/dev/ui-kit' });
  expect(screen.getByText('UI kit')).toBeTruthy();
  await renderRouter(routes, { initialUrl: '/dev/filters' });
  expect(screen.getByText('Filters demo')).toBeTruthy();
});

test('release build: a link to a developer screen lands on Home instead', async () => {
  setDev(false);
  await renderRouter(routes, { initialUrl: '/dev/ui-kit' });
  expect(screen.queryByText('UI kit')).toBeNull();
  expect(screen.getByText('Home')).toBeTruthy();
});
