import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, EmptyState, ErrorState, Notice, Screen, SkeletonList, StaleBanner, Text, space } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { useRequireAccount } from '@/features/auth/useRequireAccount';
import { PickRow, PlanRow } from './HubRows';
import { useHub } from './useHub';

/**
 * P0-16: Needs your response, Open group picks, Upcoming. (Drafts and Past are pilot scope.) Moves without a refresh when
 * someone edits a plan or votes.
 */
export function PlansHubScreen() {
  const router = useRouter();
  const requireAccount = useRequireAccount();
  const { query, hub } = useHub();

  const startPick = () => requireAccount('/pick/new', () => router.push(href('/pick/new')));
  const empty = hub && hub.needsResponse.length + hub.picks.length + hub.upcoming.length === 0;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Text variant="title" accessibilityRole="header">Plans</Text>
      <Button label="Start a group pick" variant="secondary" onPress={startPick} />

      {hub === null && query.isPending ? <SkeletonList rows={3} rowHeight={96} /> : null}
      {hub === null && !query.isPending ? <ErrorState message="Couldn't load your plans." onRetry={() => query.refetch()} /> : null}
      {hub && query.isError ? <StaleBanner onRetry={() => query.refetch()} /> : null}

      {empty ? (
        <EmptyState
          title="No plans yet"
          body="Start one from any experience on the map, or open a group pick with your friends."
          actionLabel="Find something to do"
          onAction={() => router.navigate(href('/'))}
        />
      ) : null}

      {hub && !empty ? (
        <>
          {hub.needsResponse.length > 0 ? (
            <Section title="Needs your response" count={hub.needsResponse.length}>
              {hub.needsResponse.map((p) => <PlanRow key={p.id} plan={p} onPress={() => router.push(href(`/plan/${p.id}`))} />)}
            </Section>
          ) : (
            <Notice tone="success" title="You're all caught up.">Nothing needs your response.</Notice>
          )}
          {hub.picks.length > 0 ? (
            <Section title="Open group picks" count={hub.picks.length}>
              {hub.picks.map((p) => <PickRow key={p.id} pick={p} onPress={() => router.push(href(`/pick/${p.id}`))} />)}
            </Section>
          ) : null}
          {hub.upcoming.length > 0 ? (
            <Section title="Upcoming" count={hub.upcoming.length}>
              {hub.upcoming.map((p) => <PlanRow key={p.id} plan={p} onPress={() => router.push(href(`/plan/${p.id}`))} />)}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong" accessibilityRole="header">{title}</Text>
        <Text variant="small" muted>{count}</Text>
      </View>
      {children}
    </View>
  );
}
