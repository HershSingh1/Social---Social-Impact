import { StyleSheet, View } from 'react-native';
import { radius, space, useColors } from './theme';
import { Text } from './Text';

type Tone = 'error' | 'info' | 'success';

/** A message in words. Errors are announced to screen readers. */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: string }) {
  const c = useColors();
  const [bg, fg] = { error: [c.dangerSoft, c.danger], info: [c.primarySoft, c.text], success: [c.successSoft, c.success] }[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: bg }]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'polite' : undefined}
    >
      {title ? <Text variant="bodyStrong" color={fg}>{title}</Text> : null}
      {children ? <Text variant="small" color={tone === 'info' ? c.text : fg}>{children}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { padding: space.md, borderRadius: radius.md, gap: space.xs } });
