import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeInvalidate } from '@/features/groups/hooks';
import { fetchPlanDetail } from './api';

/**
 * Live plan: counts and statuses reach other phones through Realtime on rsvps / plan_revisions / plans, with a short
 * poll as a backstop. Counts are always recomputed from rows; the server stays the source of truth.
 */
export function usePlanDetail(planId: string) {
  const { userId } = useAuth();
  const keys = [['plan', userId, planId]];
  useRealtimeInvalidate({ name: `plan-${planId}-rsvps`, table: 'rsvps', filter: `plan_id=eq.${planId}`, keys });
  useRealtimeInvalidate({ name: `plan-${planId}-revisions`, table: 'plan_revisions', filter: `plan_id=eq.${planId}`, keys });
  useRealtimeInvalidate({ name: `plan-${planId}-plan`, table: 'plans', filter: `id=eq.${planId}`, keys });
  return useQuery({
    queryKey: ['plan', userId, planId],
    queryFn: () => fetchPlanDetail(planId),
    enabled: !!userId,
    refetchInterval: 4000,
  });
}
