import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchRoster, rosterKey } from './api';

// Realtime only tells us "something changed"; the list itself is always read through react-query.
// Until the channel reports SUBSCRIBED (or after it drops) a 5 s poll keeps the list within the P0-03 target.
const POLL_WHILE_DISCONNECTED_MS = 5_000;
const POLL_WHILE_LIVE_MS = 30_000;

export function useGroupRoster(groupId: string) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const invalidate = () => { void queryClient.invalidateQueries({ queryKey: rosterKey(groupId) }); };
    const channel = supabase.channel(`group-members:${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, invalidate)
      .subscribe(status => {
        const subscribed = status === 'SUBSCRIBED';
        setLive(subscribed);
        // Catch anything that happened between the first read and the channel opening.
        if (subscribed) invalidate();
      });
    return () => { void supabase.removeChannel(channel); };
  }, [groupId, queryClient]);

  return useQuery({
    queryKey: rosterKey(groupId),
    queryFn: () => fetchRoster(groupId),
    refetchInterval: live ? POLL_WHILE_LIVE_MS : POLL_WHILE_DISCONNECTED_MS,
  });
}
