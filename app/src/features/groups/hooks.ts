import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchGroup, fetchJoinCode, fetchMembers, fetchMyGroups } from './api';

/** Cheap safety net behind Realtime: a missed socket message is corrected within this many ms. */
const POLL_MS = 5000;

/**
 * Subscribe to Postgres changes on a table (Realtime applies RLS, so only rows this person may read arrive)
 * and refetch the given queries when anything changes. Totals always come from the server, never from the event.
 */
export function useRealtimeInvalidate(opts: { name: string; table: string; filter?: string; keys: QueryKey[] }) {
  const qc = useQueryClient();
  const { name, table, filter } = opts;
  const keysJson = JSON.stringify(opts.keys);
  useEffect(() => {
    const keys = JSON.parse(keysJson) as QueryKey[];
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => {
        for (const queryKey of keys) qc.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, name, table, filter, keysJson]);
}

export function useMyGroups() {
  const { userId } = useAuth();
  useRealtimeInvalidate({ name: `my-groups-${userId}`, table: 'group_members', keys: [['groups', userId]] });
  return useQuery({ queryKey: ['groups', userId], queryFn: fetchMyGroups, enabled: !!userId, refetchInterval: POLL_MS * 2 });
}

export function useGroup(groupId: string) {
  const { userId } = useAuth();
  return useQuery({ queryKey: ['group', userId, groupId], queryFn: () => fetchGroup(groupId), enabled: !!userId });
}

/** Live roster: new joins appear without a refresh (Realtime on group_members, plus a short poll as a backstop). */
export function useMembers(groupId: string) {
  const { userId } = useAuth();
  useRealtimeInvalidate({
    name: `members-${groupId}`, table: 'group_members', filter: `group_id=eq.${groupId}`,
    keys: [['members', userId, groupId], ['group', userId, groupId], ['groups', userId]],
  });
  return useQuery({
    queryKey: ['members', userId, groupId], queryFn: () => fetchMembers(groupId), enabled: !!userId, refetchInterval: POLL_MS,
  });
}

export function useJoinCode(groupId: string) {
  const { userId } = useAuth();
  return useQuery({ queryKey: ['joinCode', userId, groupId], queryFn: () => fetchJoinCode(groupId), enabled: !!userId });
}
