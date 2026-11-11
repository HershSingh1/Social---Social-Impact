import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, minTap, radius, space, type } from './theme';

export function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.bodyText, style]} />;
}

type ButtonProps = {
  label: string;
  accessibilityLabel?: string;
  variant?: 'primary' | 'secondary' | 'text';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void | Promise<void>;
};

export function Button({ label, accessibilityLabel = label, variant = 'primary', loading = false,
  disabled = false, onPress }: ButtonProps) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = loading || pending;
  const foreground = variant === 'primary' ? color.onPrimary : color.text;
  async function press() {
    if (locked.current || disabled || busy) return;
    locked.current = true;
    setPending(true);
    setFailed(false);
    try { await onPress(); }
    catch { setFailed(true); }
    finally { locked.current = false; setPending(false); }
  }
  return <View style={styles.gap}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
      onPress={() => { void press(); }} style={({ pressed }) => [styles.control, styles[variant],
        (disabled || pressed) && styles.dimmed]}>
      {busy && <ActivityIndicator color={foreground} accessible={false} />}
      <Label style={[styles.buttonText, { color: foreground }]}>{busy ? `${label}…` : label}</Label>
    </Pressable>
    {failed && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">Couldn’t finish. Try again.</Label>}
  </View>;
}

type FieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string; value: string; onChangeText: (value: string) => void; error?: string;
};
export function TextField({ label, error, style, accessibilityLabel = label, ...props }: FieldProps) {
  return <View style={styles.gap}>
    <Label>{label}</Label>
    <TextInput {...props} accessibilityLabel={accessibilityLabel}
      accessibilityHint={error ? `Error: ${error}` : props.accessibilityHint}
      placeholderTextColor={color.textMuted} style={[styles.input, style]} />
    {error && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Label>}
  </View>;
}

export function Chip({ label, selected = false, disabled = false, onPress }: {
  label: string; selected?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.control, styles.chip, selected ? styles.primary : styles.secondary, disabled && styles.dimmed]}>
    <Label style={{ color: selected ? color.onPrimary : color.text }}>{selected ? `✓ ${label}` : label}</Label>
  </Pressable>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Avatar({ name, uri }: { name: string; uri?: string }) {
  const [failedUri, setFailedUri] = useState<string>();
  return <View accessible accessibilityRole="image" accessibilityLabel={name} style={styles.avatar}>
    {uri && failedUri !== uri
      ? <Image source={{ uri }} style={styles.avatarImage} onError={() => setFailedUri(uri)} accessible={false} />
      : <Label>{Array.from(name.trim())[0]?.toLocaleUpperCase() || '?'}</Label>}
  </View>;
}

export function AvatarStack({ people }: { people: { id: string; name: string; uri?: string }[] }) {
  return <View style={styles.stack} accessible accessibilityLabel={people.map(p => p.name).join(', ')}>
    {people.map((person, index) => <View key={person.id} style={index > 0 && styles.overlap}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Avatar {...person} />
    </View>)}
  </View>;
}

export function Tag({ label }: { label: string }) {
  return <View style={styles.tag}><Label>{label}</Label></View>;
}

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Sheet({ title, visible, onClose, children }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.sheetRoot}>
      <View style={styles.backdrop} importantForAccessibility="no-hide-descendants" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Label accessibilityRole="header" style={type.heading}>{title}</Label>
            <Button label="Close" accessibilityLabel={`Close ${title}`} variant="text" onPress={onClose} />
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  </Modal>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <View style={styles.state} accessibilityState={{ busy: true }} accessible accessibilityLabel={label}>
    <ActivityIndicator color={color.primary} /><Label>{label}</Label>
  </View>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return <View style={styles.state}><Label style={type.heading}>{title}</Label><Label>{description}</Label></View>;
}
// Render alongside retained content. Retrying never owns or clears feature state.
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  return <View style={styles.state}>
    <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Label>
    <Button label="Try again" variant="secondary" onPress={onRetry} />
  </View>;
}

// Existing placeholder tokens only: final Figma styling remains blocked on file access.
const styles = StyleSheet.create({
  bodyText: { ...type.body, color: color.text, flexShrink: 1 },
  gap: { gap: space.xs },
  flex: { flex: 1 },
  control: { minHeight: minTap, minWidth: minTap, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  primary: { backgroundColor: color.primary },
  secondary: { backgroundColor: color.surface, borderColor: color.line, borderWidth: StyleSheet.hairlineWidth },
  text: { backgroundColor: color.bg },
  buttonText: { textAlign: 'center' },
  dimmed: { opacity: 0.5 },
  input: { ...type.body, color: color.text, minHeight: minTap, minWidth: minTap, padding: space.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, borderRadius: radius.sm },
  chip: { borderRadius: radius.pill },
  card: { padding: space.lg, gap: space.md, backgroundColor: color.surface, borderRadius: radius.lg },
  avatar: { minWidth: minTap, minHeight: minTap, padding: space.sm, backgroundColor: color.surface,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line,
    alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: minTap, height: minTap, borderRadius: radius.pill },
  stack: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  overlap: { marginLeft: -space.sm },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xs,
    borderRadius: radius.sm, backgroundColor: color.surface },
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  state: { padding: space.lg, gap: space.md },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: color.overlay, opacity: 0.5 },
  sheet: { maxHeight: '100%', backgroundColor: color.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
