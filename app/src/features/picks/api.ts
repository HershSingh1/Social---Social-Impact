import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { logEvent } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { addDraftOption, EMPTY_DRAFT, type DraftOption, type PickDraft, type VoteValue } from './model';

const DRAFT_KEY = 'sidequest:pick-draft:v1';
export const pickKey = (id: string) => ['pick', id] as const;

export type GroupChoice = { id: string; name: string };
export type PickOption = DraftOption & {
  id: string;
  position: number;
  tally: { yes: number; maybe: number; no: number };
  myVote?: VoteValue;
};
export type PickDetail = {
  id: string;
  title: string;
  groupId: string;
  groupName: string;
  organizerId: string;
  deadline: string;
  state: string;
  starredOptionId?: string;
  /** Set by the server when the pick closes (TEC-30); null when nobody voted. */
  winnerOptionId?: string;
  /** A losing option the organizer chose to plan instead of the winner. */
  overrideOptionId?: string;
  /** The server's sentence naming the rule that decided the winner. */
  tieRule?: string;
  /** The plan made from this pick, when the viewer is invited to it (RLS). */
  planId?: string;
  options: PickOption[];
  voters: { id: string; name: string; avatar?: string; complete: boolean }[];
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadDraft(): Promise<PickDraft> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return EMPTY_DRAFT;
  try { return { ...EMPTY_DRAFT, ...JSON.parse(raw) } as PickDraft; }
  catch { return EMPTY_DRAFT; }
}
export async function saveDraft(draft: PickDraft) { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export async function clearDraft() { await AsyncStorage.removeItem(DRAFT_KEY); }
export async function addExperienceToPickDraft(option: DraftOption) {
  const next = addDraftOption(await loadDraft(), option);
  await saveDraft(next);
  return next;
}

export async function fetchGroups(): Promise<GroupChoice[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to start a group pick.');
  const { data, error } = await supabase.from('group_members').select('group_id, groups(id,name)')
    .eq('user_id', auth.user.id).is('removed_at', null).eq('blocked', false);
  fail(error);
  return ((data ?? []) as unknown as { groups: GroupChoice | GroupChoice[] | null }[])
    .flatMap(row => row.groups ? (Array.isArray(row.groups) ? row.groups : [row.groups]) : []);
}

export async function fetchExperience(id: string): Promise<DraftOption> {
  const { data, error } = await supabase.from('experiences').select('id,name,category,area').eq('id', id).single();
  fail(error);
  if (!data) throw new Error('Activity not found.');
  return { experienceId: data.id, name: data.name, detail: [data.category, data.area].filter(Boolean).join(' · ') };
}

export async function createPick(draft: PickDraft, clientKey: string, deadline: Date): Promise<string> {
  const starred = draft.starredExperienceId
    ? draft.options.findIndex(option => option.experienceId === draft.starredExperienceId) + 1 : null;
  const { data, error } = await supabase.rpc('create_pick', {
    group_id: draft.groupId,
    options: draft.options.map(option => ({ experience_id: option.experienceId,
      proposed_start: option.proposedStart ? new Date(option.proposedStart).toISOString() : null })),
    deadline: deadline.toISOString(), starred: starred || null, client_key: clientKey,
  });
  if (error) {
    const wrapped = new Error(error.message) as Error & { code?: string; details?: string };
    wrapped.code = error.code; wrapped.details = error.details;
    throw wrapped;
  }
  logEvent('pick_created', { pick_id: data as string, group_id: draft.groupId });
  return data as string;
}

export async function castVote(optionId: string, value: VoteValue | null) {
  const { error } = await supabase.rpc('cast_vote', { option_id: optionId, value });
  fail(error);
  if (value) logEvent('vote_cast', { option_id: optionId, value });
}

export async function addOptionToPick(pickId: string, experienceId: string) {
  const { error } = await supabase.rpc('add_option', { pick_id: pickId, experience_id: experienceId, proposed_start: null });
  fail(error);
}

export async function fetchPick(id: string): Promise<PickDetail> {
  const { data: pick, error: pickError } = await supabase.from('picks')
    .select('id,title,group_id,organizer_id,deadline,state,starred_option_id,winner_option_id,override_option_id,tie_rule,groups(name)').eq('id', id).single();
  fail(pickError);
  if (!pick) throw new Error('Pick not found.');
  const [{ data: optionRows, error: optionError }, { data: statusRows, error: statusError }, { data: memberRows, error: memberError }, { data: planRow }] = await Promise.all([
    supabase.from('pick_options').select('id,experience_id,proposed_start,position,experiences(name,category,area),option_tallies(yes,maybe,no),votes(value)').eq('pick_id', id).order('position'),
    supabase.from('pick_voter_status').select('user_id,complete').eq('pick_id', id),
    supabase.from('group_members').select('user_id').eq('group_id', pick.group_id).is('removed_at', null).eq('blocked', false),
    supabase.from('plans').select('id').eq('pick_id', id).neq('state', 'draft').maybeSingle(),
  ]);
  fail(optionError); fail(statusError); fail(memberError);
  const memberIds = (memberRows ?? []).map(row => row.user_id);
  const { data: profiles, error: profileError } = await supabase.rpc('get_profile_cards', { user_ids: memberIds });
  fail(profileError);
  const status = new Map((statusRows ?? []).map(row => [row.user_id, row.complete]));
  type ProfileCard = { user_id: string; display_name: string | null; avatar_path: string | null };
  const profileMap = new Map(((profiles ?? []) as ProfileCard[]).map(row => [row.user_id, row]));
  type RawOption = { id: string; experience_id: string; proposed_start: string | null; position: number;
    experiences: { name: string; category: string; area: string | null } | null;
    option_tallies: { yes: number; maybe: number; no: number }[] | { yes: number; maybe: number; no: number } | null;
    votes?: { value: VoteValue }[] | null };
  const options = ((optionRows ?? []) as unknown as RawOption[]).map(row => {
    const tallies = Array.isArray(row.option_tallies) ? row.option_tallies[0] : row.option_tallies;
    return { id: row.id, experienceId: row.experience_id, name: row.experiences?.name ?? 'Removed activity',
      detail: row.proposed_start ? new Date(row.proposed_start).toLocaleString() : [row.experiences?.category, row.experiences?.area].filter(Boolean).join(' · '),
      proposedStart: row.proposed_start ?? undefined, position: row.position,
      tally: tallies ?? { yes: 0, maybe: 0, no: 0 }, myVote: row.votes?.[0]?.value };
  });
  const group = Array.isArray(pick.groups) ? pick.groups[0] : pick.groups;
  return { id: pick.id, title: pick.title, groupId: pick.group_id, groupName: group?.name ?? 'Group',
    organizerId: pick.organizer_id, deadline: pick.deadline, state: pick.state,
    starredOptionId: pick.starred_option_id ?? undefined, winnerOptionId: pick.winner_option_id ?? undefined,
    overrideOptionId: pick.override_option_id ?? undefined,
    tieRule: pick.tie_rule ?? undefined, planId: (planRow as { id: string } | null)?.id, options,
    voters: memberIds.map(userId => ({ id: userId, name: profileMap.get(userId)?.display_name ?? 'Member',
      avatar: profileMap.get(userId)?.avatar_path ?? undefined, complete: status.get(userId) ?? false })) };
}

const PICK_ERRORS: Record<string, string> = {
  not_organizer: 'Only the organizer can do this.',
  pick_cancelled: 'This pick was cancelled.',
  pick_not_cancellable: 'This pick already has a plan, so it can’t be cancelled.',
};
/** A refusal from close_pick or cancel_pick, in words; anything else stays a connection error. */
export class PickRefused extends Error {}
async function organizerCall(fn: 'close_pick' | 'cancel_pick', pickId: string) {
  const { error } = await supabase.rpc(fn, { pick_id: pickId });
  if (!error) {
    if (fn === 'close_pick') logEvent('pick_closed', { pick_id: pickId });
    return;
  }
  const known = Object.keys(PICK_ERRORS).find(code => error.message.includes(code));
  throw known ? new PickRefused(PICK_ERRORS[known]) : new Error(error.message);
}
/** Close now (P0-09). Closing twice changes nothing; the server ranks and writes the winner. */
export const closePick = (pickId: string) => organizerCall('close_pick', pickId);
/** Cancel an open or closed pick before it becomes a plan. */
export const cancelPick = (pickId: string) => organizerCall('cancel_pick', pickId);

/** Record that the organizer is planning a losing option instead of the vote winner. */
export async function overridePick(pickId: string, optionId: string) {
  const { error } = await supabase.rpc('override_pick', { pick_id: pickId, option_id: optionId });
  fail(error);
}

export function usePick(id: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: pickKey(id), queryFn: () => fetchPick(id), refetchInterval: 5000 });
  useEffect(() => {
    if (!id) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: pickKey(id) }); };
    const channel = supabase.channel(`pick-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'option_tallies' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_voter_status', filter: `pick_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_options', filter: `pick_id=eq.${id}` }, refresh)
      // Close, cancel and Planned all change the pick row, so every phone moves to the result together.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks', filter: `id=eq.${id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [client, id]);
  return query;
}
