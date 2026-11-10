export type Validated = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): Validated => ({ ok: true, value });
const bad = (error: string): Validated => ({ ok: false, error });

/** Leading and trailing spaces are trimmed (spec: Rules for every screen). */
export const trim = (s: string) => s.trim();

export function validateDisplayName(raw: string): Validated {
  const v = trim(raw);
  if (v.length === 0) return bad('Add a name so friends know who you are.');
  if (v.length > 60) return bad('Use 60 characters or fewer.');
  return ok(v);
}

export function validateGroupName(raw: string): Validated {
  const v = trim(raw);
  if (v.length === 0) return bad('Give the group a name, like Saturday crew.');
  if (v.length > 50) return bad('Use 50 characters or fewer.');
  return ok(v);
}

export function validateEmail(raw: string): Validated {
  const v = trim(raw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return bad('Enter an email like name@example.com.');
  return ok(v.toLowerCase());
}

/** Email one-time code: 6 digits. Spaces are ignored so "482 913" works. */
export function validateOtp(raw: string): Validated {
  const v = raw.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(v)) return bad('Enter the 6-digit code from your email.');
  return ok(v);
}
