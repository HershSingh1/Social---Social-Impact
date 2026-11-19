// Seasonal collections on the map (P2-05, N10). The server only returns a collection between its start and end date
// (Austin time), so one disappears after its end date with no app update. The date check here covers a phone that
// kept its cached list past midnight.
import { useQuery } from '@tanstack/react-query';
import { chicagoToday } from '../discovery/dates';
import type { Experience } from '../discovery/useExperiences';
import { supabase } from '../../lib/supabase';

export type Collection = { id: string; name: string; curatorName: string; startsOn: string; endsOn: string; reviewOn: string; experienceIds: string[] };
export const COLLECTIONS_KEY = ['collections'] as const;

export async function fetchCollections(): Promise<Collection[]> {
  const [collections, items] = await Promise.all([
    supabase.from('collections').select('id, name, curator_name, starts_on, ends_on, review_on').order('ends_on'),
    supabase.from('collection_items').select('collection_id, experience_id'),
  ]);
  if (collections.error) throw collections.error;
  if (items.error) throw items.error;
  const byCollection = new Map<string, string[]>();
  for (const i of (items.data ?? []) as { collection_id: string; experience_id: string }[]) {
    byCollection.set(i.collection_id, [...(byCollection.get(i.collection_id) ?? []), i.experience_id]);
  }
  return ((collections.data ?? []) as { id: string; name: string; curator_name: string; starts_on: string; ends_on: string; review_on: string }[])
    .map(c => ({ id: c.id, name: c.name, curatorName: c.curator_name, startsOn: c.starts_on, endsOn: c.ends_on, reviewOn: c.review_on,
      experienceIds: byCollection.get(c.id) ?? [] }));
}

export function useCollections() {
  return useQuery({ queryKey: COLLECTIONS_KEY, staleTime: 5 * 60_000, queryFn: fetchCollections });
}

/** A set-session activity with every session already past can't be done any more; flexible and unknown timing stay. */
export function hasUpcoming(item: Pick<Experience, 'timing_kind' | 'sessions'>, today: string): boolean {
  if (item.timing_kind !== 'fixed') return true;
  const sessions = Array.isArray(item.sessions) ? item.sessions as { start_local?: string }[] : [];
  return sessions.some(s => typeof s.start_local === 'string' && s.start_local.slice(0, 10) >= today);
}

/** The experiences a collection shows today: in season, still in the catalog, with something still to do. */
export function seasonalIds(collection: Collection, catalog: readonly Experience[], today = chicagoToday()): Set<string> {
  if (today < collection.startsOn || today > collection.endsOn) return new Set();
  const listed = new Set(collection.experienceIds);
  return new Set(catalog.filter(e => listed.has(e.id) && hasUpcoming(e, today)).map(e => e.id));
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Dec 1" from a plain "2026-12-01" date, with no time zone in the way. */
export const formatDate = (day: string) => shortDate.format(new Date(`${day}T00:00:00Z`));

/** "Fall in Austin · picked by Ana · through Dec 1. Reviewed Nov 17." */
export const collectionLine = (c: Collection) =>
  `${c.name} · picked by ${c.curatorName} · through ${formatDate(c.endsOn)}. Reviewed ${formatDate(c.reviewOn)}.`;
