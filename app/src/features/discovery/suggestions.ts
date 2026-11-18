import { randomUUID } from 'expo-crypto';
import { supabase } from '../../lib/supabase';

export const CATEGORIES = ['Art and walks', 'Make something', 'Outdoors', 'Food and drink', 'Games and trivia', 'Music and film', 'Active'] as const;
export type SubmissionState = 'pending' | 'approved' | 'needs_changes' | 'rejected';
export type SuggestionDraft = {
  name: string; description: string; category: string; location: string;
  timingKind: 'fixed' | 'flexible'; sessions: string; hours: string; duration: string;
  priceKind: 'exact' | 'estimated' | 'free' | 'unknown'; priceMin: string; priceMax: string;
  source: string; imageUrl: string;
};
export type Submission = { id: string; authorId: string | null; payload: Record<string, unknown>;
  state: SubmissionState; reason: string | null; createdAt: string; updatedAt: string };
export type ListingReport = { experienceId: string; issue: string; createdAt: string; name: string };
export type DraftErrors = Partial<Record<keyof SuggestionDraft, string>>;

export const EMPTY_SUGGESTION: SuggestionDraft = { name: '', description: '', category: '', location: '', timingKind: 'flexible',
  sessions: '', hours: '', duration: '', priceKind: 'unknown', priceMin: '', priceMax: '', source: '', imageUrl: '' };

export const reviewerCapabilityKey = (userId: string | undefined) => ['can-review-listings', userId] as const;

const errorText: Record<string, string> = {
  required: 'This field is required.', too_short: 'Write at least 20 characters.', too_long: 'This is too long.', invalid: 'Check this value.',
};

export function parseSessions(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [start_local, end_local] = line.split('|').map(part => part.trim());
    return { start_local, end_local };
  });
}

export function validateSuggestion(draft: SuggestionDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = 'Enter a name.';
  if (draft.description.trim().length < 20) errors.description = 'Write at least 20 characters.';
  if (!CATEGORIES.includes(draft.category as typeof CATEGORIES[number])) errors.category = 'Choose a category.';
  if (!draft.location.trim()) errors.location = 'Enter an address or meeting point.';
  if (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 1 || Number(draft.duration) > 1440) errors.duration = 'Enter 1 to 1,440 minutes.';
  if (draft.timingKind === 'fixed' && parseSessions(draft.sessions).some(s => !s.start_local || !s.end_local)) errors.sessions = 'Use start | end on each line.';
  if (draft.timingKind === 'fixed' && !draft.sessions.trim()) errors.sessions = 'Add at least one session.';
  if (draft.timingKind === 'flexible' && !draft.hours.trim()) errors.hours = 'Enter the listed hours.';
  if (draft.priceKind === 'exact' || draft.priceKind === 'estimated') {
    const minimum = Number(draft.priceMin);
    const maximum = Number(draft.priceMax);
    if (!draft.priceMin.trim() || !Number.isFinite(minimum) || minimum < 0) {
      errors.priceMin = 'Enter a price of 0 or more.';
    }
    if (draft.priceMax.trim() && (!Number.isFinite(maximum) || maximum < 0)) {
      errors.priceMax = 'Enter a price of 0 or more.';
    } else if (draft.priceMax.trim() && !errors.priceMin && maximum < minimum) {
      errors.priceMax = 'The maximum must be at least the minimum.';
    }
  }
  if (!/^https?:\/\/\S+$/.test(draft.source.trim())) errors.source = 'Enter a full http:// or https:// link.';
  if (draft.imageUrl && !/^https:\/\/\S+$/.test(draft.imageUrl.trim())) errors.imageUrl = 'Enter a full https:// image link.';
  return errors;
}

function payload(d: SuggestionDraft, submissionId?: string) {
  return { name: d.name.trim(), description: d.description.trim(), category: d.category, address: d.location.trim(),
    timing_kind: d.timingKind, ...(d.timingKind === 'fixed' ? { sessions: parseSessions(d.sessions) } : { hours_text: d.hours.trim() }),
    duration_min: Number(d.duration), price_kind: d.priceKind,
    ...((d.priceKind === 'exact' || d.priceKind === 'estimated') ? { price_min: Number(d.priceMin), ...(d.priceMax.trim() ? { price_max: Number(d.priceMax) } : {}) } : {}),
    source: d.source.trim(), ...(d.imageUrl.trim() ? { image_url: d.imageUrl.trim() } : {}), ...(submissionId ? { submission_id: submissionId } : {}) };
}

export class SuggestionError extends Error { constructor(public fields: DraftErrors = {}) { super('suggestion_failed'); } }
export async function submitSuggestion(draft: SuggestionDraft, key: string, submissionId?: string) {
  const { data, error } = await supabase.rpc('submit_listing', { client_key: key, payload: payload(draft, submissionId) });
  if (!error) return data as string;
  if (error.message.includes('invalid_listing')) {
    let raw: Record<string, string> = {}; try { raw = JSON.parse(error.details ?? '{}') as Record<string, string>; } catch {}
    const aliases: Record<string, keyof SuggestionDraft> = { location: 'location', sessions: 'sessions', hours_text: 'hours', duration_min: 'duration', price: 'priceMin', source: 'source', image_url: 'imageUrl', name: 'name', description: 'description', category: 'category' };
    throw new SuggestionError(Object.fromEntries(Object.entries(raw).map(([field, code]) => [aliases[field] ?? field, errorText[code] ?? 'Check this value.'])) as DraftErrors);
  }
  throw error;
}

const row = (r: { id: string; author_id: string | null; payload: Record<string, unknown>; state: SubmissionState; reason: string | null; created_at: string; updated_at: string }): Submission =>
  ({ id: r.id, authorId: r.author_id, payload: r.payload, state: r.state, reason: r.reason, createdAt: r.created_at, updatedAt: r.updated_at });
export async function loadSubmissions(userId: string) {
  const { data, error } = await supabase.from('submissions').select('id,author_id,payload,state,reason,created_at,updated_at').eq('author_id', userId).order('updated_at', { ascending: false });
  if (error) throw error; return (data ?? []).map(r => row(r as Parameters<typeof row>[0]));
}
export async function canReview() { const { data, error } = await supabase.rpc('can_review_listings'); if (error) throw error; return data === true; }
export async function loadReviewQueue() {
  const [subs, reports] = await Promise.all([
    supabase.from('submissions').select('id,author_id,payload,state,reason,created_at,updated_at').eq('state', 'pending').order('created_at'),
    supabase.from('listing_reports').select('experience_id,issue,created_at,experiences(name)').order('created_at'),
  ]);
  if (subs.error) throw subs.error; if (reports.error) throw reports.error;
  return { submissions: (subs.data ?? []).map(r => row(r as Parameters<typeof row>[0])), reports: (reports.data ?? []).map(r => {
    const ex = r.experiences as { name: string } | { name: string }[] | null;
    return { experienceId: r.experience_id, issue: r.issue, createdAt: r.created_at, name: (Array.isArray(ex) ? ex[0]?.name : ex?.name) ?? 'Listing' };
  }) as ListingReport[] };
}
export async function reviewSuggestion(id: string, decision: 'approve' | 'needs_changes' | 'reject', reason: string) {
  const { error } = await supabase.rpc('review_submission', { id, decision, reason: reason.trim() || null }); if (error) throw error;
}
export async function reportListing(experienceId: string, issue: string) {
  const { error } = await supabase.rpc('report_listing', { experience_id: experienceId, issue: issue.trim() }); if (error) throw error;
}
export const newSuggestionKey = randomUUID;

export function draftFrom(submission: Submission): SuggestionDraft {
  const p = submission.payload; const sessions = Array.isArray(p.sessions) ? p.sessions as { start_local?: string; end_local?: string }[] : [];
  return { ...EMPTY_SUGGESTION, name: String(p.name ?? ''), description: String(p.description ?? ''), category: String(p.category ?? ''),
    location: String(p.address ?? p.meeting_point ?? ''), timingKind: p.timing_kind === 'fixed' ? 'fixed' : 'flexible',
    sessions: sessions.map(s => `${s.start_local ?? ''} | ${s.end_local ?? ''}`).join('\n'), hours: String(p.hours_text ?? ''),
    duration: String(p.duration_min ?? ''), priceKind: ['exact', 'estimated', 'free'].includes(String(p.price_kind)) ? p.price_kind as SuggestionDraft['priceKind'] : 'unknown',
    priceMin: p.price_min == null ? '' : String(p.price_min), priceMax: p.price_max == null ? '' : String(p.price_max), source: String(p.source ?? ''), imageUrl: String(p.image_url ?? '') };
}
