import { supabase } from '../../lib/supabase';
import { closesIn, formatWhen } from '../../lib/time';

export type Person = { id: string; name: string };
export type OpenPick = { id: string; title: string; deadline: string };
export type PlanItem = { id: string; name: string; startAt: string };
export type GroupSummary = { id: string; name: string; memberCount: number; faces: Person[]; next: string };
export type GroupExtras = { code: { code: string; expiresAt: string } | null; openPick: OpenPick | null; plans: PlanItem[] };

const check = <T>({ data, error }: { data: T | null; error: unknown }): T => { if (error) throw error; return data as T; };

async function names(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const cards = check(await supabase.rpc('get_profile_cards', { user_ids: ids })) as { user_id: string; display_name: string }[];
  return new Map((cards ?? []).map(card => [card.user_id, card.display_name]));
}

async function openPicks(groupIds: string[]): Promise<(OpenPick & { groupId: string })[]> {
  const rows = check(await supabase.from('picks').select('id, group_id, title, deadline')
    .in('group_id', groupIds).eq('state', 'open')) as { id: string; group_id: string; title: string; deadline: string }[];
  return (rows ?? []).map(r => ({ id: r.id, groupId: r.group_id, title: r.title, deadline: r.deadline }));
}

/** Sent plans the viewer can read (RLS returns only plans they're invited to), soonest first, past ones dropped. */
async function upcomingPlans(groupIds: string[], now: number): Promise<(PlanItem & { groupId: string })[]> {
  const plans = check(await supabase.from('plans').select('id, group_id, experience_name, current_revision')
    .in('group_id', groupIds).eq('state', 'sent')) as { id: string; group_id: string; experience_name: string; current_revision: number }[];
  if (!plans?.length) return [];
  const revisions = check(await supabase.from('plan_revisions').select('plan_id, revision, start_at')
    .in('plan_id', plans.map(p => p.id))) as { plan_id: string; revision: number; start_at: string }[];
  const start = new Map(revisions.map(r => [`${r.plan_id}:${r.revision}`, r.start_at]));
  return plans
    .map(p => ({ id: p.id, groupId: p.group_id, name: p.experience_name, startAt: start.get(`${p.id}:${p.current_revision}`) ?? '' }))
    .filter(p => p.startAt && new Date(p.startAt).getTime() > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** One line under each group: the open vote first, then the next plan, else nothing yet. */
export function nextItem(pick: OpenPick | undefined, plan: PlanItem | undefined, now = Date.now()): string {
  if (pick) return `Vote open · ${closesIn(pick.deadline, now)}`;
  if (plan) return `${plan.name} · ${formatWhen(plan.startAt)}`;
  return 'Nothing planned yet';
}

export async function fetchMyGroups(userId: string, now = Date.now()): Promise<GroupSummary[]> {
  const mine = check(await supabase.from('group_members').select('group_id').eq('user_id', userId)
    .is('removed_at', null).eq('blocked', false)) as { group_id: string }[];
  const ids = (mine ?? []).map(m => m.group_id);
  if (ids.length === 0) return [];
  const [groups, members, picks, plans] = await Promise.all([
    supabase.from('groups').select('id, name').in('id', ids).is('archived_at', null).order('name'),
    supabase.from('group_members').select('group_id, user_id').in('group_id', ids)
      .is('removed_at', null).eq('blocked', false).order('joined_at'),
    openPicks(ids),
    upcomingPlans(ids, now),
  ]);
  const groupRows = check(groups) as { id: string; name: string }[];
  const memberRows = check(members) as { group_id: string; user_id: string }[];
  const byGroup = new Map<string, string[]>();
  for (const row of memberRows) byGroup.set(row.group_id, [...(byGroup.get(row.group_id) ?? []), row.user_id]);
  // Up to four faces per group, as in Figma.
  const shown = [...new Set([...byGroup.values()].flatMap(list => list.slice(0, 4)))];
  const nameOf = await names(shown);
  return groupRows.map(g => {
    const people = byGroup.get(g.id) ?? [];
    return {
      id: g.id, name: g.name, memberCount: people.length,
      faces: people.slice(0, 4).map(id => ({ id, name: nameOf.get(id) ?? 'Member' })),
      next: nextItem(picks.find(p => p.groupId === g.id), plans.find(p => p.groupId === g.id), now),
    };
  });
}

/** What the group page shows next to its members. Plans come back only when the viewer is invited (RLS). */
export async function fetchGroupExtras(groupId: string, now = Date.now()): Promise<GroupExtras> {
  const [code, picks, plans] = await Promise.all([
    supabase.from('join_codes').select('code, expires_at').eq('group_id', groupId).is('revoked_at', null)
      .gt('expires_at', new Date(now).toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
    openPicks([groupId]),
    upcomingPlans([groupId], now),
  ]);
  const row = check(code) as { code: string; expires_at: string } | null;
  return {
    code: row ? { code: row.code, expiresAt: row.expires_at } : null,
    openPick: picks[0] ?? null,
    plans: plans.map(({ id, name, startAt }) => ({ id, name, startAt })),
  };
}

export const myGroupsKey = ['my-groups'] as const;
export const groupExtrasKey = (groupId: string) => ['group-extras', groupId] as const;
