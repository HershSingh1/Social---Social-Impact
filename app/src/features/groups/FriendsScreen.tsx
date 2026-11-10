import { StyleSheet, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, AsyncView, Button, EmptyState, Notice, Screen, SkeletonList, Text, MIN_TAP, radius, space, useColors } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAccount } from '@/features/auth/useRequireAccount';
import { useMyGroups } from './hooks';
import { formatDay, formatWhen } from '@/shared/lib/time';
import { nextItemForGroup } from '@/features/plans/hub';
import { useHub } from '@/features/plans/useHub';
import type { GroupSummary } from './api';

export function FriendsScreen() {
  const router = useRouter();
  const { isAccount } = useAuth();
  const requireAccount = useRequireAccount();
  const groups = useMyGroups();
  const { hub } = useHub();

  const createGroup = () => requireAccount('/create-group', () => router.push(href('/create-group')));

  return (
    <Screen refreshing={groups.isRefetching} onRefresh={() => groups.refetch()}>
      <Text variant="title" accessibilityRole="header">Friends</Text>

      {!isAccount ? (
        <Notice title="You're a guest on this device.">
          Sign in to keep your groups if you switch phones.
        </Notice>
      ) : null}
      {!isAccount ? (
        <Button label="Sign in" variant="secondary" onPress={() => router.push(href('/sign-in?returnTo=%2Ffriends'))} />
      ) : null}

      <View style={styles.actions}>
        <Button label="Create group" onPress={createGroup} style={styles.flex} />
        <Button label="Join with code" variant="secondary" onPress={() => router.push(href('/join'))} style={styles.flex} />
      </View>

      <AsyncView
        query={groups}
        errorMessage="Couldn't load your groups."
        skeleton={<SkeletonList rows={3} rowHeight={88} />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title="No groups yet"
            body="Create a group for the people you already make plans with, or join one with a 6-character code."
          />
        }
      >
        {(data) => (
          <View style={{ gap: space.md }}>
            <Text variant="small" muted accessibilityRole="header">Your groups ({data.length})</Text>
            {data.map((g) => <GroupCard key={g.id} group={g} next={hub ? nextItemForGroup(g.id, hub, { day: formatDay, when: formatWhen }) : 'No plan yet'} onOpen={() => router.push(href(`/group/${g.id}`))} />)}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

function GroupCard({ group, next, onOpen }: { group: GroupSummary; next: string; onOpen: () => void }) {
  const c = useColors();
  const joined = `${group.memberCount} joined`;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${joined}. ${next}.`}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{group.name}</Text>
          <Text variant="small" muted>{joined}</Text>
        </View>
        <View style={styles.avatars}>
          {group.memberNames.map((n, i) => (
            <View key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}><Avatar name={n} size={32} /></View>
          ))}
        </View>
      </View>
      <Text variant="small" muted>{next}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  card: { minHeight: MIN_TAP * 2, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatars: { flexDirection: 'row' },
});
