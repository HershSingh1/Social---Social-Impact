import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TAP, radius, space, useColors } from './theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  /** May be async: the button shows progress and ignores taps until it settles (no double submit). */
  onPress: () => void | Promise<unknown>;
  variant?: Variant;
  disabled?: boolean;
  /** Force the busy state from outside (e.g. a mutation owned by the parent). */
  loading?: boolean;
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, accessibilityHint, style }: ButtonProps) {
  const c = useColors();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const busy = pending || !!loading;

  const bg = { primary: c.primary, secondary: c.card, ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.onPrimary, secondary: c.text, ghost: c.primary, danger: c.onDanger }[variant];
  const border = variant === 'secondary' ? c.border : 'transparent';

  async function handle() {
    if (lock.current || disabled || loading) return;
    lock.current = true;
    setPending(true);
    try {
      await onPress();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Pressable
      onPress={handle}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? `${label}, in progress` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={fg} /> : icon}
        <Text variant="bodyStrong" color={fg} style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP + 4, minWidth: MIN_TAP, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  label: { textAlign: 'center', flexShrink: 1 },
});
