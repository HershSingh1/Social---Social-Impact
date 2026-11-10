import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { useState } from 'react';
import {
  Avatar, AsyncView, Button, EmptyState, Notice, Screen, SkeletonList, Tag, Text, radius, space, useColors,
} from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { formatDateShort } from '@/shared/lib/time';
import { useAuth } from '@/features/auth/AuthProvider';
import { shareMessage, spellCode } from './codes';
import { useGroup, useJoinCode, useMembers } from './hooks';

export function GroupDetailScreen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { userId } = useAuth();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const code = useJoinCode(groupId);
  const c = useColors();
  const [notice, setNotice] = useState<string | null>(null);

  const refreshing = group.isRefetching || members.isRefetching;
  const refetchAll = () => { group.refetch(); members.refetch(); code.refetch(); };

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refetchAll}>
      <AsyncView
        query={group}
        errorMessage="Couldn't load this group."
        skeleton={<SkeletonList rows={4} />}
        isEmpty={(g) => g === null}
        empty={
          <EmptyState
            title="You're no longer in this group"
            body="Ask the owner for a new code if you want to rejoin."
            actionLabel="Back to Friends"
            onAction={() => router.replace(href('/friends'))}
          />
        }
      >
        {(g) => (
          <>
            <Stack.Screen options={{ title: g!.name }} />
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">{g!.name}</Text>
              <Text muted>
                {members.data ? `${members.data.length} joined` : 'Loading members'}
                {g!.owner_id === userId ? '. You own this group.' : '.'}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.rowBetween}>
                <Text variant="bodyStrong" accessibilityRole="header">Join code</Text>
                <Text variant="small" muted>Anyone with it can join</Text>
              </View>
              {code.data ? (
                <>
                  <Text variant="code" accessibilityLabel={`Join code ${spellCode(code.data.code)}`} selectable>
                    {code.data.code}
                  </Text>
                  <Text variant="small" muted>Valid until {formatDateShort(code.data.expires_at)} (Austin time)</Text>
                  <View style={styles.actions}>
                    <Button
                      label="Copy"
                      variant="secondary"
                      style={styles.flex}
                      onPress={async () => {
                        await Clipboard.setStringAsync(code.data!.code);
                        setNotice('Code copied.');
                      }}
                    />
                    <Button
                      label="Share"
                      variant="secondary"
                      style={styles.flex}
                      onPress={() => Share.share({ message: shareMessage(g!.name, code.data!.code) })}
                    />
                  </View>
                </>
              ) : code.isPending ? (
                <SkeletonList rows={1} rowHeight={48} />
              ) : code.isError ? (
                <Button label="Try again" variant="secondary" onPress={() => code.refetch()} />
              ) : (
                <Text muted>No active code. The owner can make a new one.</Text>
              )}
              {notice ? <Notice tone="success">{notice}</Notice> : null}
            </View>

            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong" accessibilityRole="header">Members</Text>
              <AsyncView
                query={members}
                errorMessage="Couldn't load the member list."
                skeleton={<SkeletonList rows={3} rowHeight={52} />}
                isEmpty={(d) => d.length === 0}
                empty={<EmptyState title="Just you so far" body="Share the join code so friends can join." />}
              >
                {(list) => (
                  <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, paddingVertical: space.xs }]}>
                    {list.map((m, i) => {
                      const name = m.profiles?.display_name ?? 'Someone';
                      const isOwner = m.user_id === g!.owner_id;
                      const isGuest = m.profiles?.is_guest ?? false;
                      const you = m.user_id === userId;
                      return (
                        <View
                          key={m.user_id}
                          accessible
                          accessibilityLabel={[name, you ? 'you' : null, isOwner ? 'owner' : null, isGuest ? 'guest' : null].filter(Boolean).join(', ')}
                          style={[styles.member, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
                        >
                          <Avatar name={name} />
                          <Text style={styles.flex}>{name}{you ? ' (you)' : ''}</Text>
                          {isOwner ? <Tag label="Owner" tone="info" /> : null}
                          {isGuest ? <Tag label="guest" /> : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </AsyncView>
            </View>
          </>
        )}
      </AsyncView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm },
});
