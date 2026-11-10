import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { chicagoWall, chicagoWallToDate, dayOptions, parseYmdHm, timeOptions, wallToHm, wallToYmd } from '@/shared/lib/time';
import { Button } from './Button';
import { OptionSheet } from './OptionSheet';
import { Text } from './Text';
import { space, useColors } from './theme';

const TIMES = timeOptions();

/**
 * Pick a date and a time in Austin time. Emits the instant (ISO) once both are chosen. A wall-clock time that does
 * not exist on a daylight-saving day is refused with a message instead of being shifted.
 */
export function WhenPicker({ label, valueIso, onChange, days = 30, error, clearable }: {
  label: string; valueIso: string | null; onChange: (iso: string | null) => void; days?: number; error?: string | null; clearable?: boolean;
}) {
  const c = useColors();
  const wall = valueIso ? chicagoWall(new Date(valueIso)) : null;
  const [ymd, setYmd] = useState<string | null>(wall ? wallToYmd(wall) : null);
  const [hm, setHm] = useState<string | null>(wall ? wallToHm(wall) : null);
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  const [gap, setGap] = useState(false);

  const dates = dayOptions(new Date(), days);

  function commit(nextYmd: string | null, nextHm: string | null) {
    if (!nextYmd || !nextHm) return;
    const d = chicagoWallToDate(parseYmdHm(nextYmd, nextHm));
    if (!d) { setGap(true); return; }
    setGap(false);
    onChange(d.toISOString());
  }

  const dateLabel = dates.find((d) => d.value === ymd)?.label ?? (ymd ? ymd : 'Choose a date');
  const timeLabel = TIMES.find((t) => t.value === hm)?.label ?? 'Choose a time';
  const message = error ?? (gap ? "That time doesn't exist on that day (clocks move forward). Pick another time." : null);

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="small" style={{ fontWeight: '600' }}>{label}</Text>
      <View style={styles.row}>
        <Button label={dateLabel} variant="secondary" onPress={() => setSheet('date')} accessibilityHint={`${label}: choose the date`} style={styles.flex} />
        <Button label={timeLabel} variant="secondary" onPress={() => setSheet('time')} accessibilityHint={`${label}: choose the time`} style={styles.flex} />
      </View>
      <Text variant="caption" muted>Austin time (America/Chicago)</Text>
      {clearable && valueIso ? (
        <Button label="Clear time" variant="ghost" onPress={() => { setYmd(null); setHm(null); setGap(false); onChange(null); }} />
      ) : null}
      {message ? <Text variant="small" color={c.danger} accessibilityRole="alert">Error: {message}</Text> : null}

      <OptionSheet
        visible={sheet === 'date'} title={`${label}: date`} value={ymd ?? ''} options={dates.map((d) => ({ id: d.value, label: d.label }))}
        onSelect={(v) => { setYmd(v); commit(v, hm); }} onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'time'} title={`${label}: time`} value={hm ?? ''} options={TIMES.map((t) => ({ id: t.value, label: t.label }))}
        onSelect={(v) => { setHm(v); commit(ymd, v); }} onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm }, flex: { flex: 1 } });
