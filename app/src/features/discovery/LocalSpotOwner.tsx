// Frame board D: "You added this". The author can edit (a new pending version; the live one stays until a reviewer
// approves it) or ask for removal. A reviewer decides; the server checks who is asking.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Card, Label, Sheet } from '../../ui';
import { color, type } from '../../ui/theme';
import { supabase } from '../../lib/supabase';

const requestedKey = (id: string) => ['local-spot-removal', id] as const;

export function LocalSpotOwner({ experienceId }: { experienceId: string }) {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  // The author reads only their own request (RLS), so a row here means "already asked".
  const requested = useQuery({ queryKey: requestedKey(experienceId), queryFn: async () => {
    const { data, error } = await supabase.from('local_spot_removal_requests').select('experience_id').eq('experience_id', experienceId).maybeSingle();
    if (error) throw error;
    return data !== null;
  } });

  async function ask() {
    const { error } = await supabase.rpc('request_local_spot_removal', { experience_id: experienceId });
    if (error) throw error;
    await client.invalidateQueries({ queryKey: requestedKey(experienceId) });
    setAsking(false);
  }

  return <Card>
    <Label style={type.overline}>YOU ADDED THIS</Label>
    {requested.data
      ? <Label accessibilityRole="alert" style={type.bodyStrong}>Removal requested. A reviewer will take a look.</Label>
      : <>
        <Button label="Edit" variant="secondary" size="small" onPress={() => router.push({ pathname: '/suggest', params: { edit: experienceId } } as Href)} />
        <Button label="Ask for removal" variant="secondary" size="small" onPress={async () => setAsking(true)} />
      </>}
    <Label style={styles.muted}>An edit becomes a new pending version. The current one stays live until a reviewer approves it.</Label>
    <Sheet title="Ask for removal?" visible={asking} onClose={() => setAsking(false)}>
      <Label>A reviewer will check your request and take this spot off the map. It stays visible until then.</Label>
      <Button label="Ask for removal" errorMessage="Couldn’t send your request. Try again." onPress={ask} />
      <Button label="Keep it" variant="text" onPress={async () => setAsking(false)} />
    </Sheet>
  </Card>;
}

const styles = StyleSheet.create({ muted: { ...type.caption, color: color.textSecondary } });
