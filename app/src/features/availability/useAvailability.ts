import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAvailability, setAvailability, type AvailabilityAnswer } from './api';

const availabilityKey = (pickId: string, viewerId: string, optionIds: string) =>
  ['pick-availability', pickId, viewerId, optionIds] as const;

export function useAvailability(pickId: string, viewerId: string, optionIds: string[], enabled: boolean) {
  const client = useQueryClient();
  const options = [...optionIds].sort().join(',');
  const active = enabled && Boolean(pickId && viewerId && options);
  const query = useQuery({
    queryKey: availabilityKey(pickId, viewerId, options),
    queryFn: () => fetchAvailability(options.split(','), viewerId),
    enabled: active,
  });
  const answer = useMutation({
    mutationFn: ({ optionId, status }: { optionId: string; status: AvailabilityAnswer | null }) =>
      setAvailability(optionId, status),
    onSettled: () => client.invalidateQueries({ queryKey: availabilityKey(pickId, viewerId, options) }),
  });

  useEffect(() => {
    if (!active) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: availabilityKey(pickId, viewerId, options) }); };
    const channel = supabase.channel(`pick-availability-${pickId}-${viewerId}`);
    for (const optionId of options.split(',')) {
      channel.on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'availability_tallies', filter: `option_id=eq.${optionId}`,
      }, refresh);
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    return () => { void supabase.removeChannel(channel); };
  }, [active, client, options, pickId, viewerId]);

  return { query, answer };
}
