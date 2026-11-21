// P2-11 local spots: the "Local spot" label with the author's name, shown on the Map, List and Detail. Approved
// spots only reach the app (RLS lists published rows), so a rejected or removed spot never has a label to show.
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Label, Tag } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { supabase } from '../../lib/supabase';

type Spot = { origin?: 'catalog' | 'local_spot'; added_by?: string | null };
export const isLocalSpot = (item: Spot) => item.origin === 'local_spot';

/** The author's name from their profile card. The server only returns it for the author of a published local spot. */
export function useAuthorName(addedBy: string | null | undefined) {
  return useQuery({
    queryKey: ['local-spot-author', addedBy], enabled: Boolean(addedBy), staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_cards', { user_ids: [addedBy] });
      if (error) throw error;
      return ((data ?? []) as { display_name: string }[])[0]?.display_name?.trim() || null;
    },
  }).data ?? null;
}

/** "Local spot" and "Added by Dana". Without a name (the author left, or the card did not load) only the label shows. */
export function LocalSpotTags({ item }: { item: Spot }) {
  const name = useAuthorName(isLocalSpot(item) ? item.added_by : null);
  if (!isLocalSpot(item)) return null;
  return <View style={styles.row} accessible accessibilityLabel={name ? `Local spot, added by ${name}` : 'Local spot'}>
    <Tag label="Local spot" variant="dark" />
    {name && <Label style={styles.by}>Added by {name}</Label>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  by: { ...type.caption, color: color.textSecondary },
});
