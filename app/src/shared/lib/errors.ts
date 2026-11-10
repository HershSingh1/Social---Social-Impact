/**
 * RPC functions raise exceptions whose message is a machine code (docs/rpc.md). Join-code functions return
 * {ok:false, error: code} instead. This maps both to the spec's user-facing copy.
 */
const COPY: Record<string, string> = {
  // join codes (P0-01)
  wrong_code: "That code doesn't match a group",
  expired: 'This code has expired. Ask for a new one.',
  too_many_tries: 'Too many tries, wait a minute.',
  blocked: "You're no longer in this group. Ask the owner to let you back in.",
  group_full: 'This group is full. A group holds up to 30 people.',
  too_many_groups: "You're in 20 groups already. Leave one to join another.",
  // accounts and profiles
  account_required: 'Sign in to do that.',
  profile_required: 'Add your name first.',
  invalid_display_name: 'Use a name between 1 and 60 characters.',
  invalid_name: 'Use a group name between 1 and 50 characters.',
  not_authenticated: "You're signed out. Reopen the app and try again.",
  not_member: "You're not in this group.",
  // client-side conditions
  network: 'No connection. Check your internet and try again.',
  unknown: 'Something went wrong. Try again.',
};

const CODE_RE = /^[a-z][a-z_]*$/;

export function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: unknown } | null)?.message ?? e ?? '');
  return /network request failed|failed to fetch|networkerror|timed out|econnrefused/i.test(msg);
}

/** Extract the machine code from a thrown/returned Supabase error. */
export function errorCode(e: unknown): string {
  if (isNetworkError(e)) return 'network';
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && CODE_RE.test(msg) ? msg : 'unknown';
}

export function messageForCode(code: string): string {
  return COPY[code] ?? COPY.unknown;
}

export function messageForError(e: unknown): string {
  return messageForCode(errorCode(e));
}
