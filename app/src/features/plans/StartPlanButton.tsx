// Figma: no frame for the group chooser in the Figma copy yet (TEC-118); built from the kit's Sheet, Empty and Button.
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Empty, ErrorState, Loading, Sheet } from '../../ui';
import { space } from '../../ui/theme';
import type { GroupSummary } from '../groups/overview';
import { useMyGroups } from '../groups/useMyGroups';
import { draftHref } from './drafts';

const members = (count: number) => `${count} ${count === 1 ? 'member' : 'members'}`;

type ChooserProps = {
  visible: boolean; onClose: () => void; groups: ReturnType<typeof useMyGroups>;
  onChoose: (groupId: string) => void; onCreateGroup: () => void;
};

export function GroupChooserSheet({ visible, onClose, groups, onChoose, onCreateGroup }: ChooserProps) {
  const list: GroupSummary[] | undefined = groups.data;
  // Opened before the groups loaded and there turned out to be only one: go straight through.
  useEffect(() => {
    if (visible && list?.length === 1) onChoose(list[0].id);
  }, [visible, list, onChoose]);

  return <Sheet title="Which group is this for?" visible={visible} onClose={onClose}>
    {groups.isPending ? <Loading label="Loading your groups…" />
      : !list ? <ErrorState message="Couldn’t load your groups." onRetry={async () => { await groups.refetch(); }} />
        : list.length === 0 ? <>
          <Empty title="No groups yet" description="A plan goes to a group. Create one and share its code with friends." />
          <Button label="Create group" onPress={onCreateGroup} />
        </>
          : <View style={styles.list}>
            {list.map(group => <Button key={group.id} label={group.name} variant="secondary"
              accessibilityLabel={`${group.name}, ${members(group.memberCount)}`} onPress={() => onChoose(group.id)} />)}
          </View>}
  </Sheet>;
}

// Start a plan on Detail (P0-06). One group opens the draft; several ask which; none offers Create group.
export function StartPlanButton({ experienceId, userId }: { experienceId: string; userId?: string }) {
  const groups = useMyGroups(userId);
  const [open, setOpen] = useState(false);
  const only = groups.data?.length === 1 ? groups.data[0] : undefined;

  function start(groupId: string) {
    setOpen(false);
    router.push(draftHref({ groupId, experienceId }) as Href);
  }

  return <>
    <Button label="Start a plan" onPress={() => { if (only) start(only.id); else setOpen(true); }} />
    <GroupChooserSheet visible={open} onClose={() => setOpen(false)} groups={groups} onChoose={start}
      onCreateGroup={() => { setOpen(false); router.push('/groups/new'); }} />
  </>;
}

const styles = StyleSheet.create({ list: { gap: space.xs } });
