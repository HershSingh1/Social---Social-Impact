import { supabase } from '@/shared/lib/supabase';
import type { Experience } from '@/types/database';

const COLUMNS =
  'id, name, category, description, lat, lng, area, price_kind, price_min, price_max, timing_kind, sessions, hours_text, ' +
  'duration_min, meeting_point, booking_required, booking_url, source, checked_on, status, version';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The whole active catalog. Filtering runs on the phone (P0), so Map and List always share one result set. */
export async function fetchExperiences(): Promise<Experience[]> {
  const { data, error } = await supabase.from('experiences').select(COLUMNS).eq('status', 'active').order('name');
  if (error) throw error;
  return data as unknown as Experience[];
}

/** One experience by id, including removed ones (Detail says "This listing was removed"). null = not found. */
export async function fetchExperience(id: string): Promise<Experience | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.from('experiences').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Experience | null;
}
