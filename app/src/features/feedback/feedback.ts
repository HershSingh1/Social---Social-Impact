// P2-03 feedback and preferences (TEC-153, decisions N7 and C5). Figma 4145:27293 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
// Feedback is private to its author unless they tap Share with group, and then the group only ever sees counts. Preferences
// are private. Nothing here is logged: ratings, reasons and needs are personal (rule 8).
import { supabase } from '../../lib/supabase';

export type Rating = 'would_do_again' | 'maybe' | 'not_for_me';
export const RATINGS: { value: Rating; label: string }[] = [
  { value: 'would_do_again', label: 'Would do again' }, { value: 'maybe', label: 'Maybe' }, { value: 'not_for_me', label: 'Not for me' },
];
export const ratingLabel = (r: Rating) => RATINGS.find(x => x.value === r)?.label ?? '';
export const TAGS = ['Too pricey', 'Too far', 'Great for groups', 'Bad timing'] as const;
/** The frame says 280; the server accepts up to 500. */
export const REASON_MAX = 280;

export type Feedback = { rating: Rating; tags: string[]; reason: string; shared: boolean };
export const feedbackKey = (planId: string, userId: string) => ['my-feedback', planId, userId] as const;
export const summaryKey = (planId: string) => ['feedback-summary', planId] as const;

/** The author's own row (RLS shows nobody else's), or null. */
export async function fetchMyFeedback(planId: string): Promise<Feedback | null> {
  const { data, error } = await supabase.from('feedback').select('rating, tags, reason, shared').eq('plan_id', planId).maybeSingle();
  if (error) throw error;
  const r = data as { rating: Rating; tags: string[] | null; reason: string | null; shared: boolean } | null;
  return r ? { rating: r.rating, tags: r.tags ?? [], reason: r.reason ?? '', shared: r.shared } : null;
}

export type FeedbackErrors = { rating?: string; reason?: string };
export function validateFeedback(rating: Rating | null, reason: string): FeedbackErrors {
  const errors: FeedbackErrors = {};
  if (!rating) errors.rating = 'Pick how it was.';
  if (Array.from(reason.trim()).length > REASON_MAX) errors.reason = `Use ${REASON_MAX} characters or fewer.`;
  return errors;
}

const FEEDBACK_ERRORS: Record<string, string> = {
  not_attended: 'Only people who said they went can rate an outing.',
  plan_cancelled: 'This plan was cancelled, so it can’t be rated.',
};
export const feedbackFailed = (error: unknown) => {
  const text = String((error as { message?: unknown } | null)?.message ?? '');
  const known = Object.keys(FEEDBACK_ERRORS).find(code => text.includes(code));
  return known ? FEEDBACK_ERRORS[known] : 'Couldn’t save your feedback. What you wrote is still here.';
};

/** The same plan id rewrites the same row, so a retry after a lost reply is safe. */
export async function setFeedback(planId: string, f: { rating: Rating; tags: string[]; reason: string; shared: boolean }): Promise<void> {
  const { error } = await supabase.rpc('set_feedback', { plan_id: planId, rating: f.rating, tags: f.tags, reason: f.reason.trim() || null, shared: f.shared });
  if (error) throw error;
}
export async function deleteFeedback(planId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_feedback', { plan_id: planId });
  if (error) throw error;
}

export type Summary = { sharedCount: number; wouldDoAgain: number; maybe: number; notForMe: number };
/** Counts of the people who chose to share. No names, tags or reasons ever come back. */
export async function fetchSummary(planId: string): Promise<Summary> {
  const { data, error } = await supabase.rpc('feedback_summary', { plan_id: planId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { shared_count: number; would_do_again: number; maybe: number; not_for_me: number } | null | undefined;
  return { sharedCount: row?.shared_count ?? 0, wouldDoAgain: row?.would_do_again ?? 0, maybe: row?.maybe ?? 0, notForMe: row?.not_for_me ?? 0 };
}
export const summaryLine = (s: Summary) => s.sharedCount === 0 ? 'No one has shared feedback yet' : `${s.wouldDoAgain} of ${s.sharedCount} who shared would do again`;

// --- Preferences (private) ---

export const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']] as const;
export const TIMES = [['morning', 'Mornings'], ['afternoon', 'Afternoons'], ['evening', 'Evenings'], ['night', 'Late nights']] as const;
/** A starting list drawn in the frame, to be confirmed. The server keeps one text, so these and the free text share it. */
export const ACCESS_CHIPS = ['Step-free access', 'Seating', 'Quiet places'] as const;
export const NEEDS_MAX = 300;

export type Prefs = { days: string[]; times: string[]; chips: string[]; other: string };
export const EMPTY_PREFS: Prefs = { days: [], times: [], chips: [], other: '' };
export const prefsEmpty = (p: Prefs) => !p.days.length && !p.times.length && !p.chips.length && !p.other.trim();

/** Chips then the free text, joined by "; ". Reads back the same way, so nothing the person typed is lost. */
export const encodeNeeds = (p: Pick<Prefs, 'chips' | 'other'>) => [...ACCESS_CHIPS.filter(c => p.chips.includes(c)), p.other.trim()].filter(Boolean).join('; ');
export function decodeNeeds(text: string | null): Pick<Prefs, 'chips' | 'other'> {
  const parts = (text ?? '').split('; ');
  const chips = ACCESS_CHIPS.filter(c => parts.includes(c));
  return { chips, other: parts.filter(part => !(ACCESS_CHIPS as readonly string[]).includes(part)).join('; ') };
}

export const prefsKey = (userId: string) => ['preferences', userId] as const;
export async function fetchPreferences(): Promise<Prefs | null> {
  const { data, error } = await supabase.from('preferences').select('preferred_days, preferred_times, accessibility_needs').maybeSingle();
  if (error) throw error;
  const r = data as { preferred_days: string[] | null; preferred_times: string[] | null; accessibility_needs: string | null } | null;
  return r ? { days: r.preferred_days ?? [], times: r.preferred_times ?? [], ...decodeNeeds(r.accessibility_needs) } : null;
}
export function validatePrefs(p: Prefs): string | null {
  return Array.from(encodeNeeds(p)).length > NEEDS_MAX ? `Use ${NEEDS_MAX} characters or fewer in total for accessibility needs.` : null;
}
export async function savePreferences(p: Prefs): Promise<void> {
  const { error } = await supabase.rpc('set_preferences', { preferred_days: p.days, preferred_times: p.times, accessibility_needs: encodeNeeds(p) || null });
  if (error) throw error;
}
export async function clearPreferences(): Promise<void> {
  const { error } = await supabase.rpc('clear_preferences');
  if (error) throw error;
}
export const PREFS_FAILED = 'Couldn’t save your preferences. What you chose is still here.';
