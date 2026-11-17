import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { toChicagoLocal } from '../../lib/time';
import { sourceUrl } from '../discovery/experience';

/** What a plan needs from its activity's catalog row: where to book, and the listed sessions (hints, G6). */
export type Listing = {
  providerName: string | null; bookingUrl: string | null;
  timingKind: string;
  /** Listed session starts as Austin wall-clock "YYYY-MM-DDTHH:MM". */
  sessionStarts: string[];
};

const listingKey = (experienceId: string) => ['plan-listing', experienceId] as const;
const SESSIONS_POLL_MS = 30_000;

export function toListing(row: Record<string, unknown>): Listing {
  const sessions = Array.isArray(row.sessions) ? row.sessions as { start_local?: unknown }[] : [];
  return {
    providerName: (row.provider_name ?? null) as string | null,
    bookingUrl: (row.booking_url as string | null) || sourceUrl(String(row.source ?? '')),
    timingKind: String(row.timing_kind),
    sessionStarts: sessions.flatMap(s => typeof s?.start_local === 'string' ? [s.start_local.replace(' ', 'T').slice(0, 16)] : []),
  };
}

/** Reads only. `null` when the listing is gone or hidden from the viewer. */
async function fetchListing(experienceId: string): Promise<Listing | null> {
  const { data, error } = await supabase.from('experiences').select('provider_name, booking_url, source, timing_kind, sessions')
    .eq('id', experienceId).maybeSingle();
  if (error) throw error;
  return data ? toListing(data as Record<string, unknown>) : null;
}

/** Re-read every 30 s so a session removed from the catalog shows up while the plan is open. */
export function usePlanListing(experienceId: string | null | undefined) {
  return useQuery({
    queryKey: listingKey(experienceId ?? ''), queryFn: () => fetchListing(experienceId!),
    enabled: Boolean(experienceId), refetchInterval: SESSIONS_POLL_MS,
  });
}

/** True when a fixed-session activity lists sessions and none of them starts at the plan's start time.
 * Only a hint for the organizer (G6): the plan is never blocked. A listing with no sessions at all can't
 * be compared, so it gives no warning. */
export function sessionNoLongerListed(listing: Listing | null | undefined, startAt: string): boolean {
  if (!listing || listing.timingKind !== 'fixed' || listing.sessionStarts.length === 0) return false;
  return !listing.sessionStarts.includes(toChicagoLocal(new Date(startAt)));
}
