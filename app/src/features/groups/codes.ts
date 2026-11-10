/** Join codes are 6 characters from A-Z and 2-9 without 0, O, 1 or I (spec P0-01). Case-insensitive. */
export const CODE_LENGTH = 6;

/**
 * Normalise what a person typed or pasted: trim, drop spaces and dashes, uppercase, cap at 6 characters.
 * Characters outside the alphabet are kept on purpose: the server answers "doesn't match a group" and the
 * typed text stays on screen (we never silently "correct" 0 to O).
 */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase().slice(0, CODE_LENGTH);
}

export function isCompleteCode(raw: string): boolean {
  return normalizeCode(raw).length === CODE_LENGTH;
}

/** Text shared with the system share sheet (spec P0-03). */
export function shareMessage(groupName: string, code: string): string {
  return `Join ${groupName} on Sidequest with code ${code}`;
}

/** Spoken form for screen readers: "S Q 7 K 2 M". */
export function spellCode(code: string): string {
  return code.split('').join(' ');
}
