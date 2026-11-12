import { StyleSheet, View } from 'react-native';
import { Button, Label } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import type { Revision } from './plan';
import { changeRows } from './updated';

type Props = { was: Revision; now: Revision; onAnswer: (status: 'going' | 'cant_go') => Promise<void>; errorMessage: (e: unknown) => string };

/** Shown to an invitee who said Going before a material change: old and new values, answered against the new revision. */
export function ReconfirmBanner({ was, now, onAnswer, errorMessage }: Props) {
  const rows = changeRows(was, now);
  return <View style={styles.banner} accessibilityRole="alert">
    <Label style={type.headline}>This plan changed. Are you still going?</Label>
    {rows.map(({ label, before, after }) => <View key={label} accessible style={styles.row}
      accessibilityLabel={`${label} changed from ${before} to ${after}`}>
      <Label style={styles.label}>{label}</Label>
      <Label style={styles.old}>Was: {before}</Label>
      <Label style={type.bodyStrong}>Now: {after}</Label>
    </View>)}
    <View style={styles.answers}>
      <View style={styles.flex}><Button label="Still going" onPress={() => onAnswer('going')} errorMessage={errorMessage} /></View>
      <View style={styles.flex}><Button label="Can’t go" variant="secondary" onPress={() => onAnswer('cant_go')} errorMessage={errorMessage} /></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  banner: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.orangeSoft },
  row: { gap: space.xxs },
  label: { ...type.subhead, color: color.orangeInk },
  old: { color: color.textSecondary, textDecorationLine: 'line-through' },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flexGrow: 1, flexShrink: 1 },
});
