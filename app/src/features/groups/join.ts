import { supabase } from '../../lib/supabase';

export const CODE_LENGTH = 6;
// Codes use A–Z and 2–9 without 0, O, 1 or I (P0-01).
const NOT_IN_ALPHABET = /[^A-HJ-NP-Z2-9]/g;

/** Uppercases, drops spaces and characters codes never use, and keeps at most six (paste "k7q 2mx" works). */
export const cleanCode = (raw: string) => raw.toUpperCase().replace(NOT_IN_ALPHABET, '').slice(0, CODE_LENGTH);

export type JoinError = 'wrong_code' | 'expired' | 'too_many_tries' | 'group_full' | 'too_many_groups' | 'blocked' | 'unknown';
export type Preview = { groupName: string; ownerName: string; alreadyMember: boolean };

// Spec copy (P0-01) for the first three; the rest follow the same voice.
export const joinErrorMessage: Record<JoinError, string> = {
  wrong_code: 'That code doesn’t match a group.',
  expired: 'This code has expired. Ask for a new one.',
  too_many_tries: 'Too many tries, wait a minute.',
  group_full: 'This group is full.',
  too_many_groups: 'You’re in 20 groups already. Leave one to join another.',
  blocked: 'You can’t join this group.',
  unknown: 'Couldn’t check the code. Try again.',
};

export class JoinCodeError extends Error {
  constructor(public readonly code: JoinError) { super(code); }
}

type Result = { ok: true } & Record<string, unknown> | { ok: false; error: string };
const asError = (raw: string): JoinError => raw in joinErrorMessage ? raw as JoinError : 'unknown';

async function call(fn: 'preview_group_code' | 'join_group', code: string) {
  const { data, error } = await supabase.rpc(fn, { code });
  if (error) throw error; // network or server trouble, not a code problem
  const result = data as Result;
  if (!result.ok) throw new JoinCodeError(asError(result.error));
  return result as Record<string, unknown>;
}

/** Shows the group name and owner only; never the member list (P0-01). Wrong codes count toward the limit. */
export async function previewCode(code: string): Promise<Preview> {
  const r = await call('preview_group_code', code);
  return { groupName: String(r.group_name), ownerName: String(r.owner_name ?? 'a member'), alreadyMember: Boolean(r.already_member) };
}

/** An existing member gets the group back without a second join (the server checks). */
export async function joinGroup(code: string): Promise<string> {
  const r = await call('join_group', code);
  return String(r.group_id);
}
