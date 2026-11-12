import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, ErrorState, Label, Loading, Screen, Tag } from '@/ui';
import { color, minTap, radius, size, space, type } from '@/ui/theme';
import {
  buildPlansHub, formatDateBlock, formatPickDeadline, formatTimeRange,
  type PickHubItem, type PlanHubItem,
} from './hub';
import { draftHref, type DraftItem } from './drafts';
import { useSavedDrafts, usePlansHubQuery } from './usePlansHub';
import { formatWhen } from '../../lib/time';

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return <View style={styles.section}>
    <View style={styles.sectionHeading}>
      <Label accessibilityRole="header" style={type.title2}>{title}</Label>
      <Label style={type.subhead}>{count}</Label>
    </View>
    {children}
  </View>;
}

function DateBlock({ iso }: { iso: string }) {
  const date = formatDateBlock(iso);
  return <View style={styles.dateBlock} accessibilityLabel={`${date.weekday} ${date.day}`}>
    <Label style={[type.overline, styles.dateText]}>{date.weekday}</Label>
    <Label style={[type.title2, styles.dateText]}>{date.day}</Label>
  </View>;
}

function PlanRow({ item, onPress }: { item: PlanHubItem; onPress: () => void }) {
  const label = `${item.experienceName}, ${formatTimeRange(item.startAt, item.endAt)}, ${item.groupName}, ${item.statusLabel}`;
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.hitArea}>
    <Card>
      <View style={styles.row}>
        <DateBlock iso={item.startAt} />
        <View style={styles.rowText}>
          <Label style={type.bodyStrong}>{item.experienceName}</Label>
          <Label style={[type.caption, styles.secondary]}>{formatTimeRange(item.startAt, item.endAt)} · {item.groupName}</Label>
          <Tag label={item.statusLabel} variant={item.state === 'cancelled' ? 'outline' : 'neutral'} />
        </View>
        <Label style={[type.title2, styles.chevron]} accessibilityElementsHidden>›</Label>
      </View>
    </Card>
  </Pressable>;
}

function DraftRow({ item, onPress }: { item: DraftItem; onPress: () => void }) {
  const label = `Draft: ${item.experienceName}, ${item.groupName}, ${formatWhen(item.startAt)}, saved on this phone`;
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.hitArea}>
    <Card>
      <View style={styles.row}>
        <DateBlock iso={item.startAt} />
        <View style={styles.rowText}>
          <Label style={type.bodyStrong}>{item.experienceName}</Label>
          <Label style={[type.caption, styles.secondary]}>{formatWhen(item.startAt)} · {item.groupName}</Label>
          <Tag label="Saved on this phone" variant="outline" />
        </View>
        <Label style={[type.title2, styles.chevron]} accessibilityElementsHidden>›</Label>
      </View>
    </Card>
  </Pressable>;
}

function PickRow({ item, onPress }: { item: PickHubItem; onPress: () => void }) {
  const label = `${item.title}, ${item.groupName}, ${formatPickDeadline(item.deadline)}, ${item.statusLabel}`;
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.hitArea}>
    <Card>
      <View style={styles.row}>
        <View style={styles.pickBlock}><Label style={[type.overline, styles.dateText]}>PICK</Label></View>
        <View style={styles.rowText}>
          <Label style={type.bodyStrong}>{item.title}</Label>
          <Label style={[type.caption, styles.secondary]}>{item.groupName} · {formatPickDeadline(item.deadline)}</Label>
          <Tag label={item.statusLabel} variant={item.viewerComplete ? 'neutral' : 'dark'} />
        </View>
        <Label style={[type.title2, styles.chevron]} accessibilityElementsHidden>›</Label>
      </View>
    </Card>
  </Pressable>;
}

export default function PlansHubScreen() {
  const router = useRouter();
  const query = usePlansHubQuery();
  const hub = useMemo(() => query.data && buildPlansHub(query.data), [query.data]);
  const drafts = useSavedDrafts();
  const [showPast, setShowPast] = useState(false);
  // A draft may have been saved, sent or discarded on another screen since this one was last shown.
  const refetchDrafts = drafts.refetch;
  useFocusEffect(useCallback(() => { void refetchDrafts(); }, [refetchDrafts]));

  if (query.isPending) return <Screen><Loading label="Loading plans…" /></Screen>;
  if (!hub) return <Screen><ErrorState message="Couldn’t load your plans." onRetry={async () => { await query.refetch(); }} /></Screen>;

  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Plans</Label>
    <Button label="Start a group pick" onPress={() => router.push('/pick/new')} />
    {query.isError && <ErrorState message="Couldn’t refresh your plans. Your last results are still here." onRetry={async () => { await query.refetch(); }} />}
    {hub.isEmpty && !drafts.data?.length ? <View style={styles.empty}>
      <Label accessibilityRole="header" style={type.title2}>No plans yet</Label>
      <Label style={styles.secondary}>Find something your group will enjoy, then turn it into a pick or plan.</Label>
      <Button label="Find something to do" variant="secondary" onPress={() => router.navigate('/(tabs)')} />
    </View> : <>
      <Section title="Needs your response" count={hub.needsResponse.length}>
        {hub.needsResponse.map(item => <PlanRow key={item.id} item={item} onPress={() => router.push(`/plan/${item.id}`)} />)}
      </Section>
      <Section title="Open group picks" count={hub.openPicks.length}>
        {hub.openPicks.map(item => <PickRow key={item.id} item={item} onPress={() => router.push(`/pick/${item.id}`)} />)}
      </Section>
      <Section title="Upcoming" count={hub.upcoming.length}>
        {hub.upcoming.map(item => <PlanRow key={item.id} item={item} onPress={() => router.push(`/plan/${item.id}`)} />)}
      </Section>
      <Section title="Drafts" count={drafts.data?.length ?? 0}>
        {drafts.data?.map(item => <DraftRow key={item.key} item={item} onPress={() => router.push(draftHref(item) as never)} />)}
      </Section>
      {drafts.isError && <ErrorState message="Couldn’t load the drafts saved on this phone." onRetry={async () => { await drafts.refetch(); }} />}
      {hub.past.length > 0 && <View style={styles.section}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPast }} style={[styles.hitArea, styles.sectionHeading]}
          accessibilityLabel={`Past plans, ${hub.past.length}, ${showPast ? 'shown' : 'hidden'}`} onPress={() => setShowPast(open => !open)}>
          <Label accessibilityElementsHidden style={type.title2}>Past</Label>
          <Label accessibilityElementsHidden style={type.subhead}>{hub.past.length} · {showPast ? 'Hide' : 'Show'}</Label>
        </Pressable>
        {showPast && hub.past.map(item => <PlanRow key={item.id} item={item} onPress={() => router.push(`/plan/${item.id}`)} />)}
      </View>}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hitArea: { minHeight: minTap, minWidth: minTap },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, minWidth: 0, gap: space.xs },
  dateBlock: { width: size.avatar.lg, minHeight: size.avatar.lg, paddingVertical: space.xs, borderRadius: radius.sm,
    backgroundColor: color.orangeSoft, justifyContent: 'center', alignItems: 'center' },
  pickBlock: { width: size.avatar.lg, minHeight: size.avatar.lg, paddingVertical: space.sm, borderRadius: radius.sm,
    backgroundColor: color.orangeSoft, justifyContent: 'center', alignItems: 'center' },
  dateText: { textAlign: 'center', color: color.orangeInk },
  secondary: { color: color.textSecondary },
  chevron: { color: color.textSecondary },
  empty: { flex: 1, justifyContent: 'center', gap: space.md },
});
