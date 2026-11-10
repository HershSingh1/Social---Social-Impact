import { safeReturnTo, signInHref } from './nav';

describe('safeReturnTo', () => {
  it('accepts in-app paths', () => {
    expect(safeReturnTo('/create-group')).toBe('/create-group');
    expect(safeReturnTo('/join/SQ7K2M')).toBe('/join/SQ7K2M');
    expect(safeReturnTo(['/friends', '/x'])).toBe('/friends');
  });
  it('rejects anything that could leave the app', () => {
    for (const bad of ['https://evil.example', '//evil.example', 'create-group', '/javascript:alert(1)', '/a\\b', '', undefined, null]) {
      expect(safeReturnTo(bad as never)).toBeNull();
    }
  });
});

describe('signInHref', () => {
  it('encodes the step to return to', () => {
    expect(signInHref('/create-group')).toBe('/sign-in?returnTo=%2Fcreate-group');
    expect(signInHref('/join/SQ7K2M')).toBe('/sign-in?returnTo=%2Fjoin%2FSQ7K2M');
  });
  it('falls back to home for an unsafe target', () => {
    expect(signInHref('https://evil.example')).toBe('/sign-in?returnTo=%2F');
  });
});
