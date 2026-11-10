import { errorCode, isNetworkError, messageForCode, messageForError } from './errors';

describe('errors', () => {
  it('uses the exact copy from the spec for join-code failures', () => {
    expect(messageForCode('wrong_code')).toBe("That code doesn't match a group");
    expect(messageForCode('expired')).toBe('This code has expired. Ask for a new one.');
    expect(messageForCode('too_many_tries')).toBe('Too many tries, wait a minute.');
  });
  it('reads machine codes from RPC error messages', () => {
    expect(errorCode({ message: 'account_required' })).toBe('account_required');
    expect(errorCode(new Error('voting_closed'))).toBe('voting_closed');
  });
  it('treats anything that is not a code as unknown', () => {
    expect(errorCode({ message: 'duplicate key value violates unique constraint "x"' })).toBe('unknown');
    expect(errorCode(null)).toBe('unknown');
    expect(messageForError({ message: 'weird' })).toBe('Something went wrong. Try again.');
  });
  it('detects network failures', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(errorCode(new TypeError('Network request failed'))).toBe('network');
    expect(messageForError(new TypeError('Network request failed'))).toMatch(/No connection/);
    expect(isNetworkError({ message: 'account_required' })).toBe(false);
  });
});
