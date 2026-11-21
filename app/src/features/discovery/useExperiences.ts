import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Filterable } from './filters';

// The catalog columns the Map and List need. Detail (P0-06) reads the rest.
export type Experience = Filterable & {
  id: string;
  name: string;
  description: string;
  lat: number | null;
  lng: number | null;
  area: string | null;
  image_url: string | null;
  timing_kind: 'fixed' | 'flexible' | 'unknown';
  hours_text: string | null;
  /** `[{ start_local, end_local }]` in Austin time, or null (G6). Read by the date filter. */
  sessions?: unknown;
  booking_required: boolean | null;
  /** `local_spot` for a place a person added (P2-11); the catalog rows are `catalog`. */
  origin?: 'catalog' | 'local_spot';
  /** Who added a local spot, for the "Added by" line. Null for the catalog and after that account is deleted. */
  added_by?: string | null;
  /** Set on the phone for matches to the person's own quiz answers (P1-06). Never comes from the server. */
  matchesInterests?: boolean;
};

const COLUMNS = 'id, name, category, description, lat, lng, area, image_url, price_kind, price_min, price_max, timing_kind, sessions, hours_text, booking_required, origin, added_by';

export const EXPERIENCES_KEY = ['experiences'] as const;

// A read: RLS decides what a signed-in account can see. Filters run on the phone over this one list.
export function useExperiences() {
  return useQuery({
    queryKey: EXPERIENCES_KEY,
    // The catalog changes rarely, so don't refetch on every screen mount.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Experience[]> => {
      const { data, error } = await supabase.from('experiences').select(COLUMNS).order('name');
      if (error) throw error;
      return (data ?? []) as Experience[];
    },
  });
}
