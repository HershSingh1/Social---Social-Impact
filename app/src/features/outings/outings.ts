// P2-01 "Did it happen?" (TEC-151, decision N7). Figma 4145:25677 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
import { supabase } from '../../lib/supabase';

export type OutingStatus = 'happened' | 'didnt_happen' | 'not_sure';
export type Attended = 'yes' | 'no';

/** The server only accepts an answer once the plan's current end time is this far past. */
export const PROMPT_DELAY_MS = 2 * 60 * 60 * 1000;
export const promptOpen = (endAt: string, now: number) => new Date(endAt).getTime() + PROMPT_DELAY_MS <= now;

export const OUTING_CHOICES: { status: OutingStatus; label: string }[] = [
  { status: 'happened', label: 'Happened' },
  { status: 'didnt_happen', label: 'Didn’t happen' },
  { status: 'not_sure', label: 'Not sure' },
];

/** "✓ You said it happened" and the like, for the organizer's saved answer. */
export const outingSaid: Record<OutingStatus, string> = {
  happened: 'You said it happened', didnt_happen: 'You said it didn’t happen', not_sure: 'You said you’re not sure',
};
export const attendedSaid: Record<Attended, string> = { yes: 'You went', no: 'You didn’t go' };

const SERVER_ERRORS: Record<string, string> = {
  too_early: 'It’s too early to answer. You can answer 2 hours after the plan ends.',
  plan_cancelled: 'This plan was cancelled, so it can’t be reported.',
  not_organizer: 'Only the person who made this plan can say whether it happened.',
  not_going: 'Only people who said Going can say whether they went.',
};
/** Under the buttons when saving fails. The previous answer stays. */
export const saveFailed = (error: unknown) => {
  // supabase-js errors are objects with a message, not always Error instances.
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  const known = Object.keys(SERVER_ERRORS).find(code => message.includes(code));
  return known ? SERVER_ERRORS[known] : 'Couldn’t save your answer. Try again.';
};

async function call(fn: 'report_outing' | 'report_attendance', args: Record<string, string>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}
/** The plan id is the key on the server, so a retry rewrites the same row. */
export const reportOuting = (planId: string, status: OutingStatus) => call('report_outing', { plan_id: planId, status });
export const reportAttendance = (planId: string, attended: Attended) => call('report_attendance', { plan_id: planId, attended });

export type MyAnswers = { outing: OutingStatus | null; attended: Attended | null };
export const answersKey = (planId: string, userId: string) => ['outing-answers', planId, userId] as const;
/** The organizer reads their own report and everyone reads their own attendance; RLS shows nobody else's. */
export async function fetchMyAnswers(planId: string, userId: string, isOrganizer: boolean): Promise<MyAnswers> {
  const [report, attendance] = await Promise.all([
    isOrganizer ? supabase.from('outing_reports').select('organizer_status').eq('plan_id', planId).maybeSingle() : null,
    supabase.from('attendance').select('attended').eq('plan_id', planId).eq('user_id', userId).maybeSingle(),
  ]);
  if (report?.error) throw report.error;
  if (attendance.error) throw attendance.error;
  return {
    outing: (report?.data as { organizer_status: OutingStatus } | null)?.organizer_status ?? null,
    attended: (attendance.data as { attended: Attended } | null)?.attended ?? null,
  };
}

export type PastOuting = {
  planId: string; name: string; startAt: string; cancelled: boolean; organizerStatus: OutingStatus | null;
  youWent: boolean | null; countsAsOuting: boolean;
};
export const groupHistoryKey = (groupId: string) => ['group-history', groupId] as const;
type HistoryRow = { plan_id: string; activity_name: string; start_at: string; cancelled: boolean;
  organizer_status: OutingStatus | null; you_went: boolean | null; counts_as_outing: boolean };
/** Past plans, newest first. The server returns no names of who went (N7), only totals and the caller's own answer. */
export async function fetchGroupHistory(groupId: string): Promise<PastOuting[]> {
  const { data, error } = await supabase.rpc('group_history', { group_id: groupId });
  if (error) throw error;
  return ((data ?? []) as HistoryRow[]).map(r => ({
    planId: r.plan_id, name: r.activity_name, startAt: r.start_at, cancelled: r.cancelled,
    organizerStatus: r.organizer_status, youWent: r.you_went, countsAsOuting: r.counts_as_outing,
  }));
}

export type Badge = { label: string; variant: 'neutral' | 'dark' | 'outline' };
/**
 * The labels on one Past outings row. group_history does not return the organizer's name, so the organizer is
 * "The organizer" until it does; pass a first name to say "Maya says it happened".
 */
export function outingBadges(o: PastOuting, organizer = 'The organizer'): Badge[] {
  const badges: Badge[] = [];
  if (o.cancelled) badges.push({ label: 'Cancelled', variant: 'outline' });
  else if (o.organizerStatus === null) badges.push({ label: 'Planned', variant: 'outline' });
  else if (o.organizerStatus === 'happened') badges.push({ label: `${organizer} says it happened`, variant: 'neutral' });
  else if (o.organizerStatus === 'didnt_happen') badges.push({ label: `${organizer} says it didn’t happen`, variant: 'neutral' });
  else badges.push({ label: `${organizer} isn’t sure it happened`, variant: 'neutral' });
  if (o.youWent && !o.cancelled) badges.push({ label: 'You went', variant: 'dark' });
  return badges;
}
