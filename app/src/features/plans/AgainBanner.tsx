// Figma 4145:29393, boards C and E: what a Plan again draft says about where it came from and what changed.
import { StyleSheet } from 'react-native';
import { Button, Card, Label } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { formatWhen } from '../../lib/time';
import { repeatPhrase } from './again';
import type { AgainInfo } from './draft';

export function AgainBanner({ again, onStop }: { again: AgainInfo; onStop: () => Promise<void> }) {
  if (again.reminderRule) return <Card>
    <Label accessibilityRole="alert" style={type.bodyStrong}>Time to plan again.</Label>
    <Label>{again.name} repeats {repeatPhrase(again.reminderRule)}. Review the details, then send. Nothing is sent until you do.</Label>
    <Label style={type.bodyStrong}>{again.priceNote ?? 'No changes since last time'}</Label>
    <Label style={styles.caption}>Same weekday and time as the last one.</Label>
    <Button label="Stop repeating" variant="text" onPress={onStop} errorMessage="Couldn’t stop repeating. Try again." />
  </Card>;
  return <>
    <Label style={styles.caption}>Copied from {formatWhen(again.fromStart)}. Answers, votes and bookings don’t carry over.</Label>
    {again.priceNote && <Label accessibilityRole="alert" style={styles.warn}>{again.priceNote}. Check it before you send.</Label>}
  </>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: radius.sm },
});
