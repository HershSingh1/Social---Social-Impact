import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, inset, minTap, radius, shadow, size, space, type } from './theme';

export function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.bodyText, style]} />;
}

const DEFAULT_ERROR = 'Couldn’t finish. Try again.';

type ButtonProps = {
  label: string;
  accessibilityLabel?: string;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'large' | 'small';
  loading?: boolean;
  disabled?: boolean;
  /** What to show under the button when `onPress` throws. A function gets the error, so a feature can
   * say "Voting closed" or "This plan changed" instead of the generic message. */
  errorMessage?: string | ((error: unknown) => string);
  onPress: () => void | Promise<void>;
};

// The visible button is 52 pt (large) or 36 pt (small), as in Figma. The pressable around it is never
// smaller than 44 x 44 pt, so the tap target and the layout box both meet the accessibility rule.
export function Button({ label, accessibilityLabel = label, variant = 'primary', size: buttonSize = 'large',
  loading = false, disabled = false, errorMessage = DEFAULT_ERROR, onPress }: ButtonProps) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = loading || pending;
  const foreground = variant === 'primary' ? color.onPrimary : color.text;
  const small = buttonSize === 'small';
  async function press() {
    if (locked.current || disabled || busy) return;
    locked.current = true;
    setPending(true);
    setFailure(null);
    try { await onPress(); }
    catch (error) { setFailure(typeof errorMessage === 'function' ? errorMessage(error) : errorMessage); }
    finally { locked.current = false; setPending(false); }
  }
  return <View style={styles.gap}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
      onPress={() => { void press(); }} style={styles.hitArea}>
      {({ pressed }) => <View style={[styles.control, small ? styles.buttonSmall : styles.buttonLarge, styles[variant],
        variant === 'primary' && !disabled && styles.buttonShadow, (disabled || pressed) && styles.dimmed]}>
        {busy && <ActivityIndicator color={foreground} accessible={false} />}
        <Label style={[small ? type.subhead : type.headline, styles.buttonText, { color: foreground }]}>
          {busy ? `${label}…` : label}
        </Label>
      </View>}
    </Pressable>
    {failure && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{failure}</Label>}
  </View>;
}

type FieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string; value: string; onChangeText: (value: string) => void; error?: string;
};
export function TextField({ label, error, style, accessibilityLabel = label, ...props }: FieldProps) {
  return <View style={styles.fieldWrap}>
    <Label style={styles.fieldLabel}>{label}</Label>
    <TextInput {...props} accessibilityLabel={accessibilityLabel}
      accessibilityHint={error ? `Error: ${error}` : props.accessibilityHint}
      placeholderTextColor={color.textMuted} style={[styles.input, style]} />
    {error && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Label>}
  </View>;
}

// 34 pt tall in Figma; the pressable around it is 44 pt.
export function Chip({ label, selected = false, disabled = false, onPress }: {
  label: string; selected?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.hitArea, styles.hug]}>
    <View style={[styles.chip, selected ? styles.chipSelected : styles.chipDefault, disabled && styles.dimmed]}>
      <Label style={[type.subhead, { color: selected ? color.onPrimary : color.text }]}>{selected ? `✓ ${label}` : label}</Label>
    </View>
  </Pressable>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type AvatarSize = keyof typeof size.avatar;

export function Avatar({ name, uri, size: avatarSize = 'md' }: { name: string; uri?: string; size?: AvatarSize }) {
  const [failedUri, setFailedUri] = useState<string>();
  const px = size.avatar[avatarSize];
  return <View accessible accessibilityRole="image" accessibilityLabel={name}
    style={[styles.avatar, { width: px, height: px, borderRadius: px / 2 }]}>
    {uri && failedUri !== uri
      ? <Image source={{ uri }} style={{ width: px, height: px }} onError={() => setFailedUri(uri)} accessible={false} />
      // The initial sits inside a fixed circle, so it ignores the system text size.
      : <Text maxFontSizeMultiplier={1} style={[type.captionStrong, styles.initial,
        { fontSize: Math.round(px * 0.4), lineHeight: Math.round(px * 0.5) }]}>
        {Array.from(name.trim())[0]?.toLocaleUpperCase() || '?'}
      </Text>}
  </View>;
}

// Overlap is 30% of the avatar width, as in the Figma stacks (7 pt on 24 pt avatars, 10 pt on 32 pt).
export function AvatarStack({ people, size: avatarSize = 'sm' }: {
  people: { id: string; name: string; uri?: string }[]; size?: AvatarSize;
}) {
  const overlap = -Math.round(size.avatar[avatarSize] * inset.avatarOverlap);
  return <View style={styles.stack} accessible accessibilityLabel={people.map(p => p.name).join(', ')}>
    {people.map((person, index) => <View key={person.id} style={index > 0 && { marginLeft: overlap }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Avatar {...person} size={avatarSize} />
    </View>)}
  </View>;
}

// Status is always in the label, never only in the style.
export function Tag({ label, variant = 'neutral' }: { label: string; variant?: 'neutral' | 'dark' | 'outline' }) {
  return <View style={[styles.tag, styles[`tag_${variant}`]]}>
    <Label style={[type.captionStrong, { color: variant === 'dark' ? color.onPrimary : color.textSecondary }]}>{label}</Label>
  </View>;
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

// Tapping the dimmed area closes the sheet, like Close, Android Back and the screen reader escape gesture.
// The backdrop is hidden from screen readers; they use Close.
export function Sheet({ title, visible, onClose, children }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.sheetRoot}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} testID="sheet-backdrop"
        importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
      <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Label accessibilityRole="header" style={type.title2}>{title}</Label>
            <Button label="Close" accessibilityLabel={`Close ${title}`} variant="text" size="small" onPress={onClose} />
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
  return <View style={styles.state}><Label style={type.title2}>{title}</Label><Label>{description}</Label></View>;
}
// Render alongside retained content. Retrying never owns or clears feature state.
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  return <View style={styles.state}>
    <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Label>
    <Button label="Try again" variant="secondary" onPress={onRetry} />
  </View>;
}

const styles = StyleSheet.create({
  bodyText: { ...type.body, color: color.text, flexShrink: 1 },
  gap: { gap: space.xs },
  flex: { flex: 1 },
  // Vertical padding on the visible controls is absorbed by their Figma heights at normal text size and gives
  // enlarged text room to breathe at 200% (a 22 pt line + 8 + 8 = 38 pt, under the 52 and 36 pt minimums).
  // Hit area: never smaller than 44 x 44 pt, whatever size the visible control is.
  hitArea: { minHeight: minTap, minWidth: minTap, justifyContent: 'center' },
  hug: { alignSelf: 'flex-start' }, // a chip is as wide as its label (64 pt for "Label" in Figma), not the whole row
  control: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  buttonLarge: { minHeight: size.buttonLarge, minWidth: minTap, paddingHorizontal: inset.buttonLarge, paddingVertical: space.sm, borderRadius: radius.md },
  buttonSmall: { minHeight: size.buttonSmall, minWidth: minTap, paddingHorizontal: inset.buttonSmall, paddingVertical: space.sm, borderRadius: radius.sm },
  primary: { backgroundColor: color.primary },
  secondary: { backgroundColor: color.bg, borderColor: color.lineStrong, borderWidth: 1 },
  text: { backgroundColor: 'transparent' },
  buttonShadow: { boxShadow: [...shadow.button] },
  buttonText: { textAlign: 'center' },
  dimmed: { opacity: 0.5 },
  fieldWrap: { gap: inset.fieldGap },
  fieldLabel: { ...type.subhead, color: color.textSecondary },
  input: { ...type.body, color: color.text, minHeight: size.field, paddingHorizontal: inset.field, paddingVertical: space.sm, backgroundColor: color.bg,
    borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.sm },
  chip: { minHeight: size.chip, paddingHorizontal: inset.chip, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chipDefault: { backgroundColor: color.bg, borderWidth: 1, borderColor: color.lineStrong },
  chipSelected: { backgroundColor: color.primary },
  card: { paddingHorizontal: inset.cardX, paddingVertical: inset.cardY, gap: space.md, backgroundColor: color.bg,
    borderRadius: radius.lg, boxShadow: [...shadow.card] },
  avatar: { backgroundColor: color.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: color.text },
  stack: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  tag: { alignSelf: 'flex-start', minHeight: size.tag, paddingHorizontal: inset.tag, paddingVertical: space.xs, borderRadius: radius.xs,
    alignItems: 'center', justifyContent: 'center' },
  tag_neutral: { backgroundColor: color.surface },
  tag_dark: { backgroundColor: color.primary },
  tag_outline: { borderWidth: 1, borderColor: color.lineStrong },
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: inset.screen, paddingVertical: space.lg, gap: space.lg, flexGrow: 1 },
  state: { padding: space.lg, gap: space.md },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: color.overlay, opacity: 0.5 },
  sheet: { maxHeight: '100%', backgroundColor: color.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  sheetContent: { paddingTop: inset.sheetTop, paddingHorizontal: inset.sheetX, paddingBottom: space.lg, gap: inset.sheetGap },
  grabber: { alignSelf: 'center', width: size.grabber.width, height: size.grabber.height, borderRadius: size.grabber.radius,
    backgroundColor: color.strong },
});
