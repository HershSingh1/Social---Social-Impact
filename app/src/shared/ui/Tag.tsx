import { StyleSheet, View } from 'react-native';
import { radius, space, useColors } from './theme';
import { Text } from './Text';

type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

/** Status is always words (never color alone). */
export function Tag({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = useColors();
  const map = {
    neutral: [c.surface, c.textMuted], info: [c.primarySoft, c.primary], success: [c.successSoft, c.success],
    warn: [c.warnSoft, c.warn], danger: [c.dangerSoft, c.danger],
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: map[0] }]}>
      <Text variant="caption" color={map[1]} style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontWeight: '700' },
});
