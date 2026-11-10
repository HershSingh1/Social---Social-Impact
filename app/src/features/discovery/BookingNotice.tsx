import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Notice, Text, radius, space, useColors } from '@/shared/ui';
import { BOOKING_NOTICE, providerName } from './format';

/**
 * Shown on Detail, Review and Plan whenever booking is required: "Booking required. Going here does not reserve a
 * spot." with the provider link. The app never records or implies a ticket or reservation (spec P0-15).
 */
export function BookingNotice({ required, url }: { required: boolean; url: string | null }) {
  const c = useColors();
  const [linkError, setLinkError] = useState<string | null>(null);
  const provider = providerName(url);

  if (!required) return <Notice tone="success" title="No booking needed.">Just show up at the meeting point.</Notice>;

  async function open() {
    setLinkError(null);
    try { await Linking.openURL(url as string); }
    catch { setLinkError("Couldn't open the booking page. Check the link in the source and try again."); }
  }

  return (
    <View style={[styles.box, { backgroundColor: c.warnSoft }]}>
      <Text variant="bodyStrong" color={c.warn}>{BOOKING_NOTICE}</Text>
      {provider ? <Text variant="small" color={c.warn}>Each person books with {provider} on their site.</Text> : null}
      {linkError ? <Notice tone="error">{linkError}</Notice> : null}
      {url ? <Button label={`Book with ${provider ?? 'the provider'}`} variant="secondary" onPress={open} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { padding: space.lg, borderRadius: radius.lg, gap: space.sm } });
