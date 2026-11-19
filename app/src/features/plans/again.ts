// P2-04 Plan again and Repeat (TEC-154, decisions N9 and C2). Figma 4145:29393 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
// Plan again builds a draft on the phone from today's catalog. Nothing carries over except the activity, the time of
// day and the people: no answers, votes, bookings or attendance. Nothing is sent until the organizer reviews and sends.
import { supabase } from '../../lib/supabase';
import { fromChicagoLocal, toChicagoLocal } from '../../lib/time';
import type { Experience } from '../discovery/useExperiences';
import { discardDraft, newDraft, saveDraft, type AgainInfo, type PlanDraft } from './draft';
import { fetchPlan, type Plan, type Price } from './plan';
import { priceShort } from './updated';

export type RepeatRule = 'weekly' | 'every_2_weeks' | 'monthly';
export const REPEAT_OPTIONS: { rule: RepeatRule | null; label: string }[] = [
  { rule: null, label: 'Doesn’t repeat' }, { rule: 'weekly', label: 'Every week' },
  { rule: 'every_2_weeks', label: 'Every 2 weeks' }, { rule: 'monthly', label: 'Every month' },
];
export const repeatLabel = (rule: RepeatRule | null | undefined) => REPEAT_OPTIONS.find(o => o.rule === (rule ?? null))?.label ?? 'Doesn’t repeat';
/** "Sketch and stroll repeats every 2 weeks." reads from the lower-case label. */
export const repeatPhrase = (rule: RepeatRule) => repeatLabel(rule).replace(/^Every/, 'every');

const REPEAT_ERRORS: Record<string, string> = {
  not_organizer: 'Only the person who made this plan can repeat it.',
  plan_cancelled: 'This plan was cancelled, so it can’t repeat.',
};
export const repeatFailed = (error: unknown) => {
  const text = String((error as { message?: unknown } | null)?.message ?? '');
  const known = Object.keys(REPEAT_ERRORS).find(code => text.includes(code));
  return known ? REPEAT_ERRORS[known] : 'Couldn’t save. Try again.';
};
/** A null rule clears it. Asking for the rule it already has changes nothing, so a retry is safe. */
export async function setRepeat(planId: string, rule: RepeatRule | null): Promise<void> {
  const { error } = await supabase.rpc('set_repeat', { plan_id: planId, rule });
  if (error) throw error;
}

// --- Dates, on the Austin wall clock so the time of day holds across a DST change (rule 4) ---

const addDays = (local: string, days: number) => {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.toISOString().slice(0, 10)}${local.slice(10)}`;
};
/** One month on, from the 31st landing on the last day of a shorter month (as the server does). */
const addMonth = (local: string) => {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m, Math.min(d, last)));
  return `${next.toISOString().slice(0, 10)}${local.slice(10)}`;
};

/** The next start after `now` that keeps the old plan's weekday and clock time (a repeat rule sets the step; none means weekly). */
export function nextStart(prevStart: string, rule: RepeatRule | null | undefined, now = Date.now()): Date {
  let local = toChicagoLocal(new Date(prevStart));
  for (let i = 0; i < 400; i += 1) {
    local = rule === 'monthly' ? addMonth(local) : addDays(local, rule === 'every_2_weeks' ? 14 : 7);
    const at = fromChicagoLocal(local);
    if (at && at.getTime() > now) return at;
  }
  return new Date(now + 7 * 86_400_000);
}

/** "Price changed from $30 to $38", or null when it is the same. */
export function priceChangedLine(was: Pick<Price, 'kind' | 'min' | 'max'>, now: Pick<Price, 'kind' | 'min' | 'max'>): string | null {
  const before = priceShort(was);
  const after = priceShort(now);
  return before === after ? null : `Price changed from ${before} to ${after}`;
}

/** Three listed activities with the closest price, for a plan whose activity is gone (plans keep no category). */
export function similarListings(catalog: readonly Experience[], price: Pick<Price, 'kind' | 'min' | 'max'>, skipId?: string | null): Experience[] {
  const target = price.kind === 'free' ? 0 : price.max ?? price.min;
  const cost = (e: Experience) => e.price_kind === 'free' ? 0 : e.price_max ?? e.price_min;
  const gap = (e: Experience) => { const c = cost(e); return target == null || c == null ? Number.MAX_SAFE_INTEGER : Math.abs(c - target); };
  return catalog.filter(e => e.id !== skipId).sort((a, b) => gap(a) - gap(b) || a.name.localeCompare(b.name)).slice(0, 3);
}

// --- Reading what the draft needs ---

type Row = { id: string; name: string; status: string; meeting_point: string | null; address: string | null; duration_min: number | null;
  price_kind: Price['kind']; price_min: number | null; price_max: number | null };
const COLUMNS = 'id, name, status, meeting_point, address, duration_min, price_kind, price_min, price_max';
export type Listing = { id: string; name: string; meetingPoint: string; durationMin: number | null; price: Pick<Price, 'kind' | 'min' | 'max'> };
const toListing = (r: Row): Listing => ({ id: r.id, name: r.name, meetingPoint: r.meeting_point ?? r.address ?? '', durationMin: r.duration_min,
  price: { kind: r.price_kind, min: r.price_min, max: r.price_max } });

/** Today's row for the plan's activity, or null when the listing is gone or hidden. Reads only; RLS decides. */
export async function fetchListing(experienceId: string | null): Promise<Listing | null> {
  if (!experienceId) return null;
  const { data, error } = await supabase.from('experiences').select(COLUMNS).eq('id', experienceId).maybeSingle();
  if (error) throw error;
  const row = data as Row | null;
  return row && row.status === 'published' ? toListing(row) : null;
}

async function memberIds(groupId: string): Promise<string[]> {
  const { data, error } = await supabase.from('group_members').select('user_id').eq('group_id', groupId).is('removed_at', null).eq('blocked', false);
  if (error) throw error;
  return ((data ?? []) as { user_id: string }[]).map(m => m.user_id);
}

export type AgainSource = { plan: Plan; groupId: string; members: string[] };
export type AgainResult = { kind: 'ready'; href: string } | { kind: 'removed'; plan: Plan; groupId: string; members: string[] };

export const againKey = (planId: string) => ['plan-again', planId] as const;
const hrefFor = (draft: PlanDraft) => `/plan/new?group=${draft.groupId}&experience=${draft.experienceId}`;

/**
 * The draft for a new plan like this one: same people who are still in the group, the same weekday and time of day next
 * time round, today's meeting point and length. The viewer organizes it, so the old organizer is invited too.
 */
export function buildAgainDraft(src: AgainSource, listing: Listing, viewerId: string, opts: { reminder?: boolean; now?: number } = {}): PlanDraft {
  const { plan, groupId, members } = src;
  const prev = plan.current;
  const invited = new Set(plan.invitees.map(i => i.userId));
  const rule = plan.repeatRule ?? null;
  const start = nextStart(prev.startAt, opts.reminder ? rule : null, opts.now);
  const length = new Date(prev.endAt).getTime() - new Date(prev.startAt).getTime();
  const draft = newDraft({ groupId, experienceId: listing.id }, {
    start, durationMin: Math.round(length / 60_000), meetingPoint: listing.meetingPoint || prev.meetingPoint,
    recipients: members.filter(id => id !== viewerId && invited.has(id)),
  });
  const again: AgainInfo = {
    planId: plan.id, name: listing.name, fromStart: prev.startAt,
    priceNote: listing.id === plan.experienceId ? priceChangedLine(prev.price, listing.price) : null,
    ...(opts.reminder && rule ? { reminderRule: rule } : {}),
  };
  return { ...draft, again };
}

/** Builds and saves the draft, replacing any older one for this activity and group, then says where to go. */
export async function startAgain(src: AgainSource, listing: Listing, viewerId: string, opts: { reminder?: boolean } = {}): Promise<string> {
  const draft = buildAgainDraft(src, listing, viewerId, opts);
  await discardDraft(draft);
  await saveDraft(draft);
  return hrefFor(draft);
}

export async function loadAgain(planId: string, viewerId: string, reminder: boolean): Promise<AgainResult> {
  const plan = await fetchPlan(planId);
  if (!plan.groupId) throw new Error('group_unavailable');
  const [listing, members] = await Promise.all([fetchListing(plan.experienceId), memberIds(plan.groupId)]);
  const src: AgainSource = { plan, groupId: plan.groupId, members };
  if (!listing) return { kind: 'removed', ...src };
  return { kind: 'ready', href: await startAgain(src, listing, viewerId, { reminder }) };
}
