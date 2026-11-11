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
  booking_required: boolean;
};

const COLUMNS = 'id, name, category, description, lat, lng, area, image_url, price_kind, price_min, price_max, timing_kind, hours_text, booking_required';

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
