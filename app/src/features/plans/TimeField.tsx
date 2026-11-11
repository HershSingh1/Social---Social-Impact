import DateTimePicker from '@react-native-community/datetimepicker';
import { StyleSheet, View } from 'react-native';
import { Label } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { PLAN_TIME_ZONE } from '../../lib/time';

export function TimeField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (d: Date) => void }) {
  return <View style={styles.field}>
    <Label style={styles.fieldLabel}>{label}</Label>
    <View style={styles.pickers}>
      {/* Pickers run in Austin time whatever the phone's zone is (rule 4). */}
      <DateTimePicker value={new Date(value)} mode="date" display="compact" timeZoneName={PLAN_TIME_ZONE}
        accessibilityLabel={`${label} date`} onChange={(_, d) => { if (d) onChange(d); }} />
      <DateTimePicker value={new Date(value)} mode="time" display="compact" timeZoneName={PLAN_TIME_ZONE} minuteInterval={5}
        accessibilityLabel={`${label} time`} onChange={(_, d) => { if (d) onChange(d); }} />
    </View>
    {error && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Label>}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  fieldLabel: { ...type.subhead, color: color.textSecondary },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
