import { supabase } from '@/lib/supabase';

/** The events the server accepts in Phase 1. A new phase adds its names here and in log_event. */
export type EventName =
  | 'experience_viewed' | 'pick_created' | 'vote_cast' | 'pick_closed' | 'plan_drafted'
  | 'plan_sent' | 'invite_viewed' | 'rsvp_saved' | 'plan_edited' | 'plan_cancelled';

/**
 * Ids, a vote value, an answer, whether an edit was material and the names of the fields that changed.
 * Never notes, contacts, calendar contents, budgets, photos or invite codes (AGENTS.md rule 8): the server
 * keeps only these keys, but do not pass anything else.
 */
export type EventProps = {
  experience_id?: string; pick_id?: string; option_id?: string; plan_id?: string; group_id?: string;
  value?: 'yes' | 'maybe' | 'no'; status?: 'going' | 'cant_go'; material?: boolean; surface?: string;
  changed?: ('start_local' | 'end_local' | 'meeting_point' | 'note')[];
};

/**
 * Records one event and returns at once. It never waits, never retries and never throws: a failed or
 * offline log must not slow or break the screen it was called from.
 */
export function logEvent(name: EventName, props: EventProps = {}): void {
  try {
    const clean = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
    Promise.resolve(supabase.rpc('log_event', { name, props: clean })).catch(() => undefined);
  } catch {
    // Logging is best effort.
  }
}
