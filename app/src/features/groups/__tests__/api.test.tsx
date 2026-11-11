import { expect, jest, test } from '@jest/globals';
import { formatCode, shareText, spokenCode, validateGroupName } from '../api';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

test('group names must be 1 to 50 characters after trimming', () => {
  expect(validateGroupName('   ')).not.toBeNull();
  expect(validateGroupName(' a ')).toBeNull();
  expect(validateGroupName('x'.repeat(50))).toBeNull();
  expect(validateGroupName('x'.repeat(51))).not.toBeNull();
});

test('the share text and code formats match the spec', () => {
  expect(shareText('Friday Crew', 'K7Q2MX')).toBe('Join Friday Crew on Sidequest with code K7Q2MX');
  expect(formatCode('K7Q2MX')).toBe('K7Q 2MX');
  expect(spokenCode('K7Q2MX')).toBe('K 7 Q 2 M X');
});
