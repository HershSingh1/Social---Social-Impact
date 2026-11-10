import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNow } from '@/shared/hooks/useNow';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeInvalidate } from '@/features/groups/hooks';
import { fetchHub } from './hubApi';
import { buildHub, type Hub } from './hub';

/**
 * One live read behind the Plans tab, its badge, the Friends "next item" and Group detail. Any change to an RSVP, a plan,
 * a revision, a pick or a vote status that this person may see refreshes it without pulling to refresh (Realtime, plus a
 * 5 s poll as a backstop). The key starts with "plans" so existing invalidations of ['plans'] refresh it too.
 */
export function useHub() {
  const { userId } = useAuth();
  const keys = [['plans', userId, 'hub']];
  useRealtimeInvalidate({ name: 'hub-rsvps', table: 'rsvps', keys });
  useRealtimeInvalidate({ name: 'hub-plans', table: 'plans', keys });
  useRealtimeInvalidate({ name: 'hub-revisions', table: 'plan_revisions', keys });
  useRealtimeInvalidate({ name: 'hub-picks', table: 'picks', keys });
  useRealtimeInvalidate({ name: 'hub-voters', table: 'pick_voter_status', keys });
  const query = useQuery({
    queryKey: ['plans', userId, 'hub'],
    queryFn: () => fetchHub(userId as string),
    enabled: !!userId,
    refetchInterval: 5000,
  });
  const now = useNow(30_000);
  const hub: Hub | null = useMemo(() => (query.data ? buildHub(query.data.plans, query.data.picks, now) : null), [query.data, now]);
  return { query, hub };
}
