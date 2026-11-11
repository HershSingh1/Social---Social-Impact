import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { Button, Card, Label } from '@/ui';
import { space, type } from '@/ui/theme';

export function BookingNotice({ required, providerName, url }: {
  required: boolean; providerName?: string | null; url?: string | null;
}) {
  if (!required) return <Card>
    <Label style={type.headline}>No booking needed</Label>
  </Card>;

  return <Card>
    <Label style={type.headline}>Booking required</Label>
    <Label>Going here does not reserve a spot.</Label>
    {url
      ? <View style={{ alignSelf: 'flex-start', marginTop: space.xs }}>
        <Button label={`Open ${providerName || 'provider'}`} variant="secondary" size="small"
          onPress={async () => { await Linking.openURL(url); }} />
      </View>
      : <Label>Provider link is being checked.</Label>}
  </Card>;
}
