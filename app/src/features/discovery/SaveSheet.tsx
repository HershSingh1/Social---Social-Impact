import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, ErrorState, Label, Loading, Sheet } from '../../ui';
import { color, minTap, radius, space, type } from '../../ui/theme';
import { useMyGroups } from '../groups/useMyGroups';
import { isSaved, saveErrorMessage, savesKey, setSave, useSaves } from './saves';

type Props = { visible: boolean; onClose: () => void; experienceId: string; experienceName: string; userId: string };

function Row({ title, saved, busy, onPress }: { title: string; saved: boolean; busy: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: saved, busy, disabled: busy }}
    disabled={busy} onPress={onPress} style={styles.row}>
    <Label style={[type.bodyStrong, styles.flex]}>{title}</Label>
    <View style={[styles.pill, saved && styles.pillOn]}>
      <Label style={[type.subhead, { color: saved ? color.onPrimary : color.text }]}>{busy ? 'Saving…' : saved ? 'Saved' : 'Not saved'}</Label>
    </View>
  </Pressable>;
}

// Save sheet (P0-07): one toggle for "Save for me" and one per group. Each toggle adds or removes only the
// viewer's own save in that place, and a short message confirms where it went.
export function SaveSheet({ visible, onClose, experienceId, experienceName, userId }: Props) {
  const queryClient = useQueryClient();
  const saves = useSaves(userId);
  const groups = useMyGroups(userId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const locked = useRef(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  async function toggle(groupId: string | null, destination: string, saved: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusyKey(groupId ?? 'me');
    setMessage(null);
    try {
      await setSave(experienceId, groupId, saved);
      setMessage({ text: saved ? `Saved to ${destination}.` : `Removed from ${destination}.`, failed: false });
      await queryClient.invalidateQueries({ queryKey: savesKey });
    } catch (error) {
      // The toggle did not happen, so every row keeps showing what is really saved.
      setMessage({ text: saveErrorMessage(error), failed: true });
    } finally {
      locked.current = false;
      setBusyKey(null);
    }
  }

  const rows = saves.data ?? [];
  const myGroups = groups.data ?? [];
  return <Sheet title="Save this activity" visible={visible} onClose={onClose}>
    <Label style={styles.caption}>{experienceName}</Label>
    {saves.isPending || groups.isPending ? <Loading label="Loading your groups…" />
      : !saves.data || !groups.data
        ? <ErrorState message="Couldn’t load where you can save this." onRetry={async () => { await Promise.all([saves.refetch(), groups.refetch()]); }} />
        : <View style={styles.list}>
          <Row title="Save for me" saved={isSaved(rows, userId, experienceId, null)} busy={busyKey === 'me'}
            onPress={() => { void toggle(null, 'My saves', !isSaved(rows, userId, experienceId, null)); }} />
          {myGroups.map(group => <Row key={group.id} title={`Save to ${group.name}`}
            saved={isSaved(rows, userId, experienceId, group.id)} busy={busyKey === group.id}
            onPress={() => { void toggle(group.id, group.name, !isSaved(rows, userId, experienceId, group.id)); }} />)}
          {myGroups.length === 0 && <Label style={styles.caption}>Join or create a group to save ideas together.</Label>}
          <Label style={styles.caption}>Only you see My saves. Everyone in a group sees what you save to it.</Label>
        </View>}
    {message && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{message.text}</Label>}
    <Button label="Done" variant="secondary" onPress={onClose} />
  </Sheet>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: space.xs },
  caption: { ...type.caption, color: color.textSecondary },
  row: { minHeight: minTap, flexDirection: 'row', alignItems: 'center', gap: space.md },
  pill: { minWidth: 88, alignItems: 'center', paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: color.line, backgroundColor: color.bg },
  pillOn: { backgroundColor: color.primary, borderColor: color.primary },
});
