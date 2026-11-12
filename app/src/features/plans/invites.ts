import * as Linking from 'expo-linking';
import { logEvent } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import type { Revision } from './plan';

/** `sidequest://plan-link/TOKEN`: opens the preview in the app (a link only works on a phone that has the app). */
export const planLinkUrl = (token: string) => Linking.createURL(`plan-link/${token}`);

export type InviteErrorCode = 'link_unavailable' | 'removed_from_plan' | 'plan_cancelled' | 'plan_ended' | 'not_organizer' | 'recipient_not_a_member';
export const INVITE_ERRORS: Record<InviteErrorCode, string> = {
  link_unavailable: 'This link doesn’t work any more. Ask the organizer for a new one.',
  removed_from_plan: 'The organizer removed you from this plan.',
  plan_cancelled: 'This plan was cancelled.',
  plan_ended: 'This plan has already ended.',
  not_organizer: 'Only the person who made this plan can do this.',
  recipient_not_a_member: 'Someone you picked has left the group. Check the list and try again.',
};
/** A server refusal in words. Anything else is a connection problem and is thrown as it came. */
export class InviteRefused extends Error {
  constructor(public readonly code: InviteErrorCode) { super(INVITE_ERRORS[code]); }
}
function refuse(error: { message: string }): never {
  const known = (Object.keys(INVITE_ERRORS) as InviteErrorCode[]).find(code => error.message.includes(code));
  if (known) throw new InviteRefused(known);
  throw error;
}

export type LinkPreview = {
  activity: string; category: string; inviter: string; group: string; startAt: string; endAt: string;
  price: Revision['price']; bookingRequired: boolean | null; alreadyJoined: boolean;
};

/** Shows what the plan is. Opening a link never joins it. */
export async function previewLink(token: string): Promise<LinkPreview> {
  const { data, error } = await supabase.rpc('preview_plan_link', { token });
  if (error) refuse(error);
  const r = data as Record<string, unknown>;
  logEvent('invite_viewed', { surface: 'plan_link' });
  return {
    activity: String(r.activity), category: String(r.category), inviter: String(r.inviter ?? 'A friend'), group: String(r.group ?? 'a group'),
    startAt: String(r.start_at), endAt: String(r.end_at), price: r.price as Revision['price'],
    bookingRequired: (r.booking_required ?? null) as boolean | null, alreadyJoined: Boolean(r.already_joined),
  };
}

/** Joining twice is harmless; returns the plan id. */
export async function joinPlan(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_plan', { token });
  if (error) refuse(error);
  return data as string;
}

/** The plan's live link, made if there is none. */
export async function createLink(planId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_plan_link', { plan_id: planId });
  if (error) refuse(error);
  return data as string;
}
/** Stops new joins. People already in the plan stay in. */
export async function revokeLink(planId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_plan_link', { plan_id: planId });
  if (error) refuse(error);
}
export async function addInvitees(planId: string, userIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('add_invitees', { plan_id: planId, user_ids: userIds });
  if (error) refuse(error);
}
export async function removeInvitee(planId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_invitee', { plan_id: planId, user_id: userId });
  if (error) refuse(error);
}

export type Addable = { userId: string; name: string };
/** Group members who are not invited now (including anyone removed earlier). Reads only; RLS decides. */
export async function fetchAddable(groupId: string, invitedIds: string[]): Promise<Addable[]> {
  const members = await supabase.from('group_members').select('user_id').eq('group_id', groupId).is('removed_at', null).eq('blocked', false);
  if (members.error) throw members.error;
  const ids = ((members.data ?? []) as { user_id: string }[]).map(m => m.user_id).filter(id => !invitedIds.includes(id));
  if (ids.length === 0) return [];
  const cards = await supabase.rpc('get_profile_cards', { user_ids: ids });
  if (cards.error) throw cards.error;
  const nameOf = new Map(((cards.data ?? []) as { user_id: string; display_name: string }[]).map(c => [c.user_id, c.display_name]));
  return ids.map(userId => ({ userId, name: nameOf.get(userId) ?? 'Member' })).sort((a, b) => a.name.localeCompare(b.name));
}
