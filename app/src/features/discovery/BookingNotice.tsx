import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { Button, Card, Label } from '@/ui';
import { space, type } from '@/ui/theme';

export function BookingNotice({ required, providerName, url }: {
  required: boolean | null; providerName?: string | null; url?: string | null;
}) {
  // null: the listing doesn't say (G15). Shown as unconfirmed, never as "No booking needed".
  if (required === false) return <Card>
    <Label style={type.headline}>No booking needed</Label>
  </Card>;

  return <Card>
    <Label style={type.headline}>{required ? 'Booking required' : 'Booking not confirmed'}</Label>
    <Label>{required ? 'Going here does not reserve a spot.' : 'The listing doesn’t say if you need to book. Check with the provider before you go.'}</Label>
    {url
      ? <View style={{ alignSelf: 'flex-start', marginTop: space.xs }}>
        <Button label={`Open ${providerName || 'provider'}`} variant="secondary" size="small"
          onPress={async () => { await Linking.openURL(url); }} />
      </View>
      : <Label>Provider link is being checked.</Label>}
  </Card>;
}
