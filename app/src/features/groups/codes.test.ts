import { isCompleteCode, normalizeCode, shareMessage, spellCode } from './codes';

describe('join codes', () => {
  it('is case-insensitive and ignores spaces and dashes', () => {
    expect(normalizeCode(' sq7k2m ')).toBe('SQ7K2M');
    expect(normalizeCode('sq7-k2m')).toBe('SQ7K2M');
    expect(normalizeCode('SQ7K 2M99')).toBe('SQ7K2M');
  });
  it('does not silently correct characters outside the alphabet', () => {
    expect(normalizeCode('AB0DEI')).toBe('AB0DEI'); // server answers "doesn't match a group"
  });
  it('knows when a code is complete', () => {
    expect(isCompleteCode('SQ7K2')).toBe(false);
    expect(isCompleteCode('sq7k2m')).toBe(true);
  });
  it('builds the share text from the spec', () => {
    expect(shareMessage('Saturday crew', 'SQ7K2M')).toBe('Join Saturday crew on Sidequest with code SQ7K2M');
    expect(spellCode('SQ7K2M')).toBe('S Q 7 K 2 M');
  });
});
