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
  // group pick (P0-08, P0-09)
  open_pick_exists: 'This group already has an open pick.',
  voting_closed: 'Voting closed',
  invalid_deadline: 'Voting needs to stay open between 1 hour and 7 days.',
  invalid_option_count: 'A pick needs 2 to 5 options.',
  invalid_star: 'The tie-breaker star must be on one of the options.',
  too_many_options: 'A pick can have up to 5 options.',
  experience_unavailable: 'That experience is no longer available.',
  not_organizer: 'Only the organizer can do that.',
  pick_not_found: 'This pick is no longer available.',
  pick_not_open: 'This pick is no longer open.',
  pick_not_closed: 'Voting has to close before you can do that.',
  pick_not_cancellable: 'This pick can no longer be cancelled.',
  option_not_found: 'That option is no longer part of the pick.',
  pick_already_planned: 'This pick already has a plan.',
  pick_has_no_choice: 'Choose an option first.',
  experience_mismatch: 'The plan has to use the experience the group chose.',
  // plans (P0-11 to P0-14)
  start_in_past: 'Pick a start time in the future.',
  end_before_start: 'The end time must be after the start time.',
  nonexistent_local_time: "That time doesn't exist on that day (clocks move forward). Pick another time.",
  invalid_meeting_point: 'Add a meeting point of 1 to 200 characters.',
  invalid_note: 'Keep the note to 500 characters.',
  recipient_not_member: 'You can only invite people in the group.',
  fixed_sessions_not_supported: 'Plans for fixed-session experiences arrive in the next release.',
  plan_not_found: 'This plan is no longer available.',
  plan_cancelled: 'This plan was cancelled.',
  stale_revision: 'This plan just changed. Check the new details and answer again.',
  answers_locked: 'This plan has started, so answers are locked.',
  organizer_cannot_decline: "You're the organizer, so you can't decline your own plan.",
  plan_started: 'This plan has already started, so it can no longer be rescheduled.',
  client_key_conflict: 'That request was already used. Start the plan again.',
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
