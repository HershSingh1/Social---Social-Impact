import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { radius, space, useColors } from './theme';
import { Text } from './Text';

/** "Are you sure?" bottom sheet for actions that cannot be undone (close voting, cancel a pick). */
export function ConfirmSheet({ visible, title, body, confirmLabel, cancelLabel = 'Keep as is', danger, onConfirm, onClose }: {
  visible: boolean; title: string; body?: string; confirmLabel: string; cancelLabel?: string; danger?: boolean;
  onConfirm: () => void | Promise<unknown>; onClose: () => void;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]} accessibilityViewIsModal>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {body ? <Text muted>{body}</Text> : null}
        <Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={async () => { await onConfirm(); onClose(); }} />
        <Button label={cancelLabel} variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1 },
});
