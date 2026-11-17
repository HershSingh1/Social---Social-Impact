import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { myGroupsKey, names } from '../groups/overview';

export type UpNextDetails = { imageUrl: string | null; going: { id: string; name: string }[]; goingCount: number };

type RawDetails = {
  experience: { image_url: string | null } | { image_url: string | null }[] | null;
  rsvps: { user_id: string; status: string; removed_at: string | null }[];
};

export const upNextKey = (planId: string) => ['home-up-next', planId] as const;

/** The photo and who is going for the Up next plan. Reads through RLS; names come from `get_profile_cards`. */
export async function fetchUpNextDetails(planId: string): Promise<UpNextDetails> {
  const { data, error } = await supabase.from('plans')
    .select('experience:experiences(image_url), rsvps(user_id, status, removed_at)').eq('id', planId).maybeSingle();
  if (error) throw error;
  const row = data as unknown as RawDetails | null;
  const experience = Array.isArray(row?.experience) ? row?.experience[0] : row?.experience;
  const goingIds = (row?.rsvps ?? []).filter(rsvp => rsvp.status === 'going' && rsvp.removed_at === null).map(rsvp => rsvp.user_id);
  const nameOf = await names(goingIds.slice(0, 4));
  return {
    imageUrl: experience?.image_url ?? null,
    goingCount: goingIds.length,
    going: goingIds.slice(0, 4).map(id => ({ id, name: nameOf.get(id) ?? 'Member' })),
  };
}

export function useUpNextDetails(planId: string | undefined) {
  return useQuery({ queryKey: upNextKey(planId ?? ''), enabled: Boolean(planId), queryFn: () => fetchUpNextDetails(planId!) });
}

export const displayNameKey = (userId: string) => ['home-display-name', userId] as const;

export function useDisplayName(userId: string) {
  return useQuery({
    queryKey: displayNameKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
      if (error) throw error;
      return (data as { display_name: string | null } | null)?.display_name ?? null;
    },
    staleTime: 60_000,
  });
}

/** Realtime only invalidates queries (never writes state). The Plans hub query has its own channel in the tab layout. */
export function useHomeRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: myGroupsKey });
      void queryClient.invalidateQueries({ queryKey: ['home-up-next'] });
    };
    const channel = supabase.channel('home-live');
    for (const table of ['groups', 'group_members', 'picks', 'plans', 'plan_revisions', 'rsvps']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);
}
