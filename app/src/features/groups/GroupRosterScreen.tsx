import { StyleSheet, View } from 'react-native';
import { Avatar, Card, Empty, ErrorState, Label, Loading, Screen, Tag } from '../../ui';
import { color, space, type } from '../../ui/theme';
import type { Member } from './api';
import { useGroupRoster } from './useGroupRoster';

function MemberRow({ member }: { member: Member }) {
  return <View style={styles.row}>
    {/* Photos need a storage URL, which isn't decided yet, so everyone shows an initial for now. */}
    <Avatar name={member.name} />
    <Label style={[type.bodyStrong, styles.name]}>{member.name}</Label>
    {member.isOwner && <Tag label="Owner" variant="dark" />}
  </View>;
}

export function GroupRosterScreen({ groupId }: { groupId: string }) {
  const roster = useGroupRoster(groupId);
  const { data } = roster;

  // Loading only before anything has been read. After that a failed refresh keeps the list on screen.
  if (roster.isPending) return <Screen><Loading label="Loading members…" /></Screen>;
  if (!data) return <Screen><ErrorState message="Couldn’t load this group’s members." onRetry={() => { void roster.refetch(); }} /></Screen>;

  const count = data.members.length;
  return <Screen>
    <Label accessibilityRole="header" style={type.title}>{data.groupName || 'Group'}</Label>
    {roster.isError && <ErrorState message="Couldn’t refresh the member list. Showing the last list we loaded." onRetry={() => { void roster.refetch(); }} />}
    {count === 0
      ? <Empty title="No members to show" description="You may no longer be in this group." />
      : <Card>
        <View style={styles.header}>
          <Label accessibilityRole="header" style={type.heading}>Members</Label>
          <Label style={styles.count}>{count === 1 ? '1 member' : `${count} members`}</Label>
        </View>
        {data.members.map(member => <MemberRow key={member.userId} member={member} />)}
      </Card>}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { ...type.subhead, color: color.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  name: { flex: 1 },
});
