import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';
import { AvatarStack, Button, Card, Empty, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { fetchMyGroups, myGroupsKey, type GroupSummary } from './overview';

type Props = {
  userId: string;
  onCreate: () => void;
  onJoin: () => void;
  onOpenGroup: (groupId: string) => void;
};

const members = (n: number) => (n === 1 ? '1 member' : `${n} members`);

function GroupRow({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${group.name}, ${members(group.memberCount)}, ${group.next}`}
    onPress={onPress} style={styles.row}>
    <View style={styles.text}>
      <Label style={type.bodyStrong}>{group.name}</Label>
      <Label style={styles.caption}>{members(group.memberCount)} · {group.next}</Label>
    </View>
    <AvatarStack people={group.faces} size="xs" />
  </Pressable>;
}

// Friends tab: your groups and what's next in each ("Your groups" on Figma 2.1 Home, 28:3386).
export function FriendsScreen({ userId, onCreate, onJoin, onOpenGroup }: Props) {
  const groups = useQuery({ queryKey: [...myGroupsKey, userId], queryFn: () => fetchMyGroups(userId), refetchInterval: 30_000 });
  const retry = () => { void groups.refetch(); };

  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Your groups</Label>
    <View style={styles.actions}>
      <View style={styles.flex}><Button label="Create group" size="small" onPress={onCreate} /></View>
      <View style={styles.flex}><Button label="Join with code" variant="secondary" size="small" onPress={onJoin} /></View>
    </View>
    {groups.isPending ? <Loading label="Loading your groups…" />
      : !groups.data ? <ErrorState message="Couldn’t load your groups." onRetry={retry} />
      : <>
        {/* A failed refresh keeps the list we already have. */}
        {groups.isError && <ErrorState message="Couldn’t refresh your groups. Showing the last list we loaded." onRetry={retry} />}
        {groups.data.length === 0
          ? <Empty title="No groups yet" description="Create a group, or join one with a code from a friend." />
          : <Card>{groups.data.map(group => <GroupRow key={group.id} group={group} onPress={() => onOpenGroup(group.id)} />)}</Card>}
      </>}
  </Screen>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap, paddingVertical: space.xs },
  text: { flex: 1, gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
});
