import { validateDisplayName, validateEmail, validateGroupName, validateOtp } from './validation';

describe('validation', () => {
  it('trims names and enforces length limits', () => {
    expect(validateDisplayName('  Maya  ')).toEqual({ ok: true, value: 'Maya' });
    expect(validateDisplayName('   ').ok).toBe(false);
    expect(validateDisplayName('x'.repeat(60)).ok).toBe(true);
    expect(validateDisplayName('x'.repeat(61)).ok).toBe(false);
    expect(validateGroupName(' Saturday crew ')).toEqual({ ok: true, value: 'Saturday crew' });
    expect(validateGroupName('x'.repeat(50)).ok).toBe(true);
    expect(validateGroupName('x'.repeat(51)).ok).toBe(false);
  });
  it('validates email and one-time codes', () => {
    expect(validateEmail(' Maya@Example.COM ')).toEqual({ ok: true, value: 'maya@example.com' });
    expect(validateEmail('maya@').ok).toBe(false);
    expect(validateOtp('482 913')).toEqual({ ok: true, value: '482913' });
    expect(validateOtp('48291').ok).toBe(false);
    expect(validateOtp('48291a').ok).toBe(false);
  });
});
