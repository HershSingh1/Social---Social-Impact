// "Want to do someday" on Detail (P2-05, frames C and D): one switch per group, counts only.
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, ErrorState, Label, Loading, Sheet } from '../../ui';
import { color, minTap, radius, space, type } from '../../ui/theme';
import { useMyGroups } from '../groups/useMyGroups';
import { bucketErrorMessage, fetchWants, setBucketItem, wantsKey, type Wants } from './bucket';

type Props = { experienceId: string; experienceName: string; userId: string };

const people = (n: number, groupName: string) => `${n} ${n === 1 ? 'person' : 'people'} in ${groupName} ${n === 1 ? 'wants' : 'want'} this.`;

export function WantToDo({ experienceId, experienceName, userId }: Props) {
  const queryClient = useQueryClient();
  const wants = useQuery({ queryKey: wantsKey(experienceId), queryFn: () => fetchWants(experienceId, userId) });
  const groups = useMyGroups(userId);
  const [open, setOpen] = useState(false);
  const list = groups.data ?? [];
  const mine = list.filter(g => wants.data?.mine.has(g.id));
  const on = mine.length > 0;

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: wantsKey(experienceId) }),
    queryClient.invalidateQueries({ queryKey: ['bucket-list'] }),
  ]);
  async function set(groupId: string, wanted: boolean) {
    await setBucketItem(experienceId, groupId, wanted);
    await refresh();
  }
  // One group: the control flips it. Several, none or not loaded yet: the sheet says which group and why.
  const only = list.length === 1 ? list[0] : undefined;

  return <View style={styles.wrap}>
    <Button label={on ? '✓ On the bucket list' : 'Want to do someday'} variant={on ? 'primary' : 'secondary'}
      accessibilityLabel={on ? 'On the bucket list. Change where' : 'Want to do someday'} errorMessage={bucketErrorMessage}
      onPress={async () => { if (only) await set(only.id, !on); else setOpen(true); }} />
    {on && mine.map(g => <Label key={g.id} style={styles.caption}>{people(wants.data!.counts.get(g.id) ?? 1, g.name)}</Label>)}
    <WantSheet visible={open} onClose={() => setOpen(false)} experienceName={experienceName} groups={groups}
      wants={wants} onSet={set} />
  </View>;
}

function WantSheet({ visible, onClose, experienceName, groups, wants, onSet }: {
  visible: boolean; onClose: () => void; experienceName: string; groups: ReturnType<typeof useMyGroups>;
  wants: UseQueryResult<Wants>; onSet: (groupId: string, wanted: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  async function toggle(groupId: string, wanted: boolean) {
    if (busy) return;
    setBusy(groupId); setFailed(null);
    try { await onSet(groupId, wanted); } catch (error) { setFailed(bucketErrorMessage(error)); } finally { setBusy(null); }
  }
  return <Sheet title="Want to do someday" visible={visible} onClose={onClose}>
    <Label style={styles.caption}>{experienceName}</Label>
    <Label>Add it to the bucket list of each group that might enjoy it. Members see how many want it, not who.</Label>
    {groups.isPending || wants.isPending ? <Loading label="Loading your groups…" />
      : !groups.data || !wants.data
        ? <ErrorState message="Couldn’t load your groups." onRetry={async () => { await Promise.all([groups.refetch(), wants.refetch()]); }} />
        : groups.data.length === 0 ? <Label style={styles.caption}>Join or create a group to keep a bucket list together.</Label>
          : groups.data.map(group => {
            const wanted = wants.data!.mine.has(group.id);
            return <Pressable key={group.id} accessibilityRole="switch" accessibilityLabel={group.name}
              accessibilityState={{ checked: wanted, busy: busy === group.id, disabled: !!busy }} disabled={!!busy}
              onPress={() => { void toggle(group.id, !wanted); }} style={styles.row}>
              <Label style={[type.bodyStrong, styles.flex]}>{group.name}</Label>
              <View style={[styles.pill, wanted && styles.pillOn]}>
                <Label style={[type.subhead, { color: wanted ? color.onPrimary : color.text }]}>{busy === group.id ? 'Saving…' : wanted ? 'On' : 'Off'}</Label>
              </View>
            </Pressable>;
          })}
    {failed && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{failed}</Label>}
    <Button label="Close" variant="secondary" onPress={onClose} />
  </Sheet>;
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  flex: { flex: 1 },
  caption: { ...type.caption, color: color.textSecondary },
  row: { minHeight: minTap, flexDirection: 'row', alignItems: 'center', gap: space.md },
  pill: { minWidth: 64, alignItems: 'center', paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: color.line, backgroundColor: color.bg },
  pillOn: { backgroundColor: color.primary, borderColor: color.primary },
});
