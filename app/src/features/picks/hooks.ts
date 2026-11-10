import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeInvalidate } from '@/features/groups/hooks';
import { fetchOpenPickForGroup, fetchPickDetail } from './api';

/**
 * Live pick: votes and tallies reach other phones through Realtime on option_tallies / pick_voter_status (votes
 * themselves are private to their owner), with a 3 s poll while the pick is open as a backstop for the "within
 * 2 seconds, no pull-to-refresh" criterion.
 */
export function usePickDetail(pickId: string) {
  const { userId } = useAuth();
  const keys = [['pick', userId, pickId]];
  useRealtimeInvalidate({ name: `pick-${pickId}-pick`, table: 'picks', filter: `id=eq.${pickId}`, keys });
  useRealtimeInvalidate({ name: `pick-${pickId}-options`, table: 'pick_options', filter: `pick_id=eq.${pickId}`, keys });
  useRealtimeInvalidate({ name: `pick-${pickId}-tallies`, table: 'option_tallies', filter: `pick_id=eq.${pickId}`, keys });
  useRealtimeInvalidate({ name: `pick-${pickId}-voters`, table: 'pick_voter_status', filter: `pick_id=eq.${pickId}`, keys });
  useRealtimeInvalidate({ name: `pick-${pickId}-members`, table: 'group_members', keys });
  return useQuery({
    queryKey: ['pick', userId, pickId],
    queryFn: () => fetchPickDetail(pickId),
    enabled: !!userId,
    refetchInterval: (q) => (q.state.data?.pick.state === 'open' ? 3000 : false),
  });
}

export function useOpenPickForGroup(groupId: string | null) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['openPick', userId, groupId],
    queryFn: () => fetchOpenPickForGroup(groupId as string),
    enabled: !!userId && !!groupId,
  });
}
