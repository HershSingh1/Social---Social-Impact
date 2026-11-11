import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchPlan, planKey } from './plan';

// Realtime only says "something changed"; the plan is always reread through react-query.
// While the channel isn't connected, a 5 s poll keeps counts close to live.
const POLL_WHILE_DISCONNECTED_MS = 5_000;
const POLL_WHILE_LIVE_MS = 30_000;

export function usePlan(planId: string) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const invalidate = () => { void queryClient.invalidateQueries({ queryKey: planKey(planId) }); };
    const channel = supabase.channel(`plan:${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps', filter: `plan_id=eq.${planId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_revisions', filter: `plan_id=eq.${planId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `id=eq.${planId}` }, invalidate)
      .subscribe(status => {
        const subscribed = status === 'SUBSCRIBED';
        setLive(subscribed);
        if (subscribed) invalidate();
      });
    return () => { void supabase.removeChannel(channel); };
  }, [planId, queryClient]);

  return useQuery({
    queryKey: planKey(planId),
    queryFn: () => fetchPlan(planId),
    refetchInterval: live ? POLL_WHILE_LIVE_MS : POLL_WHILE_DISCONNECTED_MS,
    retry: (count, error) => error.message !== 'plan_unavailable' && count < 2,
  });
}
