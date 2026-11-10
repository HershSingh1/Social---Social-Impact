import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { MIN_TAP, radius, space, useColors } from './theme';
import { Text } from './Text';

export type SheetOption<T extends string> = { id: T; label: string; hint?: string };

/** A bottom sheet with a single choice. Each option is a 48 pt radio row; the current one says "selected". */
export function OptionSheet<T extends string>({ visible, title, options, value, onSelect, onClose }: {
  visible: boolean; title: string; options: SheetOption<T>[]; value: T; onSelect: (id: T) => void; onClose: () => void;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]} accessibilityViewIsModal>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        <View style={{ gap: space.xs }} accessibilityRole="radiogroup">
          {options.map((o) => {
            const on = o.id === value;
            return (
              <Pressable
                key={o.id}
                onPress={() => { onSelect(o.id); onClose(); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${o.label}${o.hint ? `, ${o.hint}` : ''}${on ? ', selected' : ''}`}
                style={[styles.option, { backgroundColor: on ? c.primarySoft : 'transparent', borderColor: on ? c.primary : c.border }]}
              >
                <Text variant="body" style={{ flex: 1 }}>{o.label}</Text>
                {o.hint ? <Text variant="small" muted>{o.hint}</Text> : null}
                {on ? <Text variant="small" color={c.primary} style={{ fontWeight: '700' }}>Selected</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <Button label="Close" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1 },
  option: { minHeight: MIN_TAP + 4, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 },
});
