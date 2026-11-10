import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MIN_TAP, radius, space, useColors } from './theme';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in words. The typed value is never cleared by an error. */
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <Text variant="small" style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.textMuted}
        {...input}
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: error ? c.danger : c.border }]}
      />
      {error ? (
        <Text variant="small" color={c.danger} accessibilityLiveRegion="polite" accessibilityRole="alert">
          Error: {error}
        </Text>
      ) : hint ? (
        <Text variant="small" muted>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: { fontWeight: '600' },
  input: {
    minHeight: MIN_TAP + 4, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md,
    paddingVertical: space.sm, fontSize: 16,
  },
});
