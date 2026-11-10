import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

const TINTS = ['#C2410C', '#0F766E', '#6D28D9', '#BE185D', '#1D4ED8', '#4D7C0F', '#B45309', '#0E7490'];
function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Decorative: the person's name is always rendered next to it, so it is hidden from screen readers. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: tintFor(name) }]}
    >
      <Text variant="bodyStrong" color="#FFFFFF" style={{ fontSize: size * 0.42 }} allowFontScaling={false}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
