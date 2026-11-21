import { afterEach, beforeEach, expect, test } from '@jest/globals';

// TEC-128: development and TestFlight (preview) builds stop early when the project id or a Supabase value is missing.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- app.config.js is a CommonJS file
const configure = require('../../../app.config.js') as (input: { config: Record<string, unknown> }) => { extra?: { eas?: { projectId?: string } } };
const KEYS = ['EAS_BUILD_PROFILE', 'EAS_PROJECT_ID', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const values = () => { process.env.EAS_PROJECT_ID = '11111111-2222-4333-8444-555555555555'; process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co'; process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon'; };

test.each(['development', 'development-simulator', 'preview'])('the %s profile refuses to build without the project id', profile => {
  process.env.EAS_BUILD_PROFILE = profile;
  expect(() => configure({ config: {} })).toThrow('Configure EAS_PROJECT_ID before building');
});

test.each(['development', 'preview'])('the %s profile names the Supabase value that is missing', profile => {
  process.env.EAS_BUILD_PROFILE = profile;
  process.env.EAS_PROJECT_ID = '11111111-2222-4333-8444-555555555555';
  expect(() => configure({ config: {} })).toThrow('Configure EXPO_PUBLIC_SUPABASE_URL before building');
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  expect(() => configure({ config: {} })).toThrow('Configure EXPO_PUBLIC_SUPABASE_ANON_KEY before building');
});

test('a placeholder value is refused', () => {
  process.env.EAS_BUILD_PROFILE = 'preview'; values();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  expect(() => configure({ config: {} })).toThrow('Configure EXPO_PUBLIC_SUPABASE_URL before building');
});

test('the preview profile is accepted with the values set, and the project id reaches the app config', () => {
  process.env.EAS_BUILD_PROFILE = 'preview'; values();
  expect(configure({ config: {} }).extra?.eas?.projectId).toBe('11111111-2222-4333-8444-555555555555');
});

test('other profiles and local runs are not checked', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  expect(() => configure({ config: {} })).not.toThrow();
  delete process.env.EAS_BUILD_PROFILE;
  expect(() => configure({ config: {} })).not.toThrow();
});
