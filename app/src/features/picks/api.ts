import { supabase } from '@/shared/lib/supabase';
import { fetchMembers } from '@/features/groups/api';
import type { PickOptionRow, PickRow, Tally, VoteValue } from '@/types/database';

export type PickMember = { user_id: string; name: string; isGuest: boolean };
export type PickDetail = {
  pick: PickRow;
  groupName: string;
  organizerName: string;
  options: PickOptionRow[];
  tallies: Record<string, Tally>;
  voters: { user_id: string; complete: boolean }[];
  /** the signed-in person's own votes (votes are private to their owner) */
  myVotes: Record<string, VoteValue>;
  members: PickMember[];
  planId: string | null;
};

const PICK_COLUMNS =
  'id, group_id, organizer_id, deadline, starred_option_id, state, winner_option_id, tie_rule, override_option_id';

type PickWithEmbeds = PickRow & {
  groups: { name: string } | null;
  organizer: { display_name: string } | null;
  pick_options: PickOptionRow[];
};

/** Everything the pick screen shows, in one round of reads. null = not visible to this person. */
export async function fetchPickDetail(pickId: string): Promise<PickDetail | null> {
  const { data, error } = await supabase
    .from('picks')
    .select(
      `${PICK_COLUMNS}, groups(name), organizer:profiles!organizer_id(display_name), ` +
        'pick_options(id, position, proposed_start, experience_id, experiences(id, name, category, area, price_kind, price_min, price_max, booking_required, timing_kind, meeting_point))',
    )
    .eq('id', pickId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = data as unknown as PickWithEmbeds;
  const options = [...p.pick_options].sort((a, b) => a.position - b.position);

  const [tallies, voters, myVotes, members, plan] = await Promise.all([
    supabase.from('option_tallies').select('option_id, yes, maybe, no').eq('pick_id', pickId),
    supabase.from('pick_voter_status').select('user_id, complete').eq('pick_id', pickId),
    supabase.from('votes').select('option_id, value').in('option_id', options.map((o) => o.id)),
    fetchMembers(p.group_id),
    supabase.from('plans').select('id').eq('pick_id', pickId).limit(1),
  ]);
  for (const r of [tallies, voters, myVotes, plan]) if (r.error) throw r.error;

  const { pick_options: _omit, groups, organizer, ...pick } = p;
  return {
    pick: pick as PickRow,
    groupName: groups?.name ?? 'Group',
    organizerName: organizer?.display_name ?? 'The organizer',
    options,
    tallies: Object.fromEntries((tallies.data ?? []).map((t) => [t.option_id, { yes: t.yes, maybe: t.maybe, no: t.no }])),
    voters: (voters.data ?? []) as PickDetail['voters'],
    myVotes: Object.fromEntries((myVotes.data ?? []).map((v) => [v.option_id, v.value as VoteValue])),
    members: members.map((m) => ({ user_id: m.user_id, name: m.profiles?.display_name ?? 'Someone', isGuest: m.profiles?.is_guest ?? false })),
    planId: (plan.data?.[0]?.id as string | undefined) ?? null,
  };
}

/** The group's open pick, if any (only one can be open at a time). */
export async function fetchOpenPickForGroup(groupId: string): Promise<Pick<PickRow, 'id' | 'organizer_id'> | null> {
  const { data, error } = await supabase.from('picks').select('id, organizer_id').eq('group_id', groupId).eq('state', 'open').maybeSingle();
  if (error) throw error;
  return data as Pick<PickRow, 'id' | 'organizer_id'> | null;
}

// ---------------------------------------------------------------- writes (RPC only)
export type NewPickOption = { experience_id: string; proposed_start: string | null };

export async function createPick(args: { groupId: string; options: NewPickOption[]; deadline: Date; starred: number | null }): Promise<string> {
  const { data, error } = await supabase.rpc('create_pick', {
    p_group_id: args.groupId,
    p_options: args.options,
    p_deadline: args.deadline.toISOString(),
    p_starred: args.starred,
  });
  if (error) throw error;
  return data as string;
}

export async function addOption(pickId: string, experienceId: string, proposedStart: string | null = null): Promise<void> {
  const { error } = await supabase.rpc('add_option', { p_pick_id: pickId, p_experience_id: experienceId, p_proposed_start: proposedStart });
  if (error) throw error;
}

/** value null clears the vote. */
export async function castVote(optionId: string, value: VoteValue | null): Promise<void> {
  const { error } = await supabase.rpc('cast_vote', { p_option_id: optionId, p_value: value });
  if (error) throw error;
}

export async function closePick(pickId: string): Promise<void> {
  const { error } = await supabase.rpc('close_pick', { p_pick_id: pickId });
  if (error) throw error;
}

export async function cancelPick(pickId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_pick', { p_pick_id: pickId });
  if (error) throw error;
}

export async function overridePick(pickId: string, optionId: string | null): Promise<void> {
  const { error } = await supabase.rpc('override_pick', { p_pick_id: pickId, p_option_id: optionId });
  if (error) throw error;
}
