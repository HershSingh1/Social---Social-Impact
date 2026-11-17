// Home, built from Figma 2.1 Home in file MkYNxuYFuktTR0yGExJnK7 (Noah's copy), frame node 28:3386.
// Left out on purpose (TEC-113): the bell (no screen behind it, D11) and the "Add your availability" row (P1).
// One addition Figma doesn't draw: "Manage groups", so Create group and Settings stay reachable until Profile (TEC-98).
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarStack, Button, Card, ErrorState, Label, Loading, Tag } from '@/ui';
import { color, inset, minTap, radius, size, space, type } from '@/ui/theme';
import { useMyGroups } from '../groups/useMyGroups';
import { usePlansHubQuery } from '../plans/usePlansHub';
import { goingLabel, greeting, groupState, needsInput, pickUpNext, todayLine, type NeedsInputItem } from './home';
import { useDisplayName, useHomeRealtime, useUpNextDetails } from './useHome';

type IconName = ComponentProps<typeof Feather>['name'];

function IconTile({ name }: { name: IconName }) {
  return <View style={styles.iconTile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Feather name={name} size={size.tabIcon} color={color.orangeInk} />
  </View>;
}

function Heading({ title, aside }: { title: string; aside?: ReactNode }) {
  return <View style={styles.heading}>
    <Label accessibilityRole="header" style={type.title2}>{title}</Label>
    {aside}
  </View>;
}

function UpNextCard({ plan, onOpen }: { plan: NonNullable<ReturnType<typeof pickUpNext>>; onOpen: () => void }) {
  const details = useUpNextDetails(plan.id);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = details.data?.imageUrl;
  const going = details.data;
  return <Card>
    {imageUrl && !imageFailed
      ? <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.photo} accessibilityLabel={`${plan.title} photo`}
        onError={() => setImageFailed(true)} />
      : <View style={[styles.photo, styles.photoFallback]}><Feather name="image" size={size.tabIcon} color={color.orangeInk} accessibilityElementsHidden /></View>}
    <Tag label="Confirmed" variant="dark" />
    <View style={styles.tight}>
      <Label accessibilityRole="header" style={type.title2}>{plan.title}</Label>
      <Label style={styles.secondary}>{plan.when} · {plan.groupName}</Label>
    </View>
    <View style={styles.cardFooter}>
      <View style={styles.going}>
        {going && going.going.length > 0 && <AvatarStack people={going.going} size="xs" />}
        {going && <Label style={[type.subhead, styles.secondary]}>{goingLabel(going.goingCount)}</Label>}
      </View>
      <Button label="View plan" accessibilityLabel={`View plan, ${plan.title}`} variant="secondary" size="small" onPress={onOpen} />
    </View>
  </Card>;
}

function NeedsRow({ item, divider, onPress }: { item: NeedsInputItem; divider: boolean; onPress: () => void }) {
  return <View style={[styles.needsRow, divider && styles.divider]}>
    <IconTile name={item.kind === 'vote' ? 'check-square' : 'calendar'} />
    <View style={styles.rowText}>
      <Label style={type.bodyStrong}>{item.title}</Label>
      <Label style={[type.caption, styles.secondary]}>{item.detail}</Label>
    </View>
    <Button label={item.action} accessibilityLabel={`${item.action}: ${item.title}`}
      variant={item.kind === 'vote' ? 'primary' : 'secondary'} size="small" onPress={onPress} />
  </View>;
}

export default function HomeScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const hub = usePlansHubQuery();
  const groups = useMyGroups(userId);
  const name = useDisplayName(userId);
  useHomeRealtime();
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const upNext = useMemo(() => (hub.data ? pickUpNext(hub.data.plans) : null), [hub.data]);
  const needs = useMemo(() => (hub.data ? needsInput(hub.data) : []), [hub.data]);

  async function refresh() {
    setRefreshing(true);
    try { await Promise.all([hub.refetch(), groups.refetch(), name.refetch()]); }
    finally { setRefreshing(false); }
  }
  const retryHub = async () => { await hub.refetch(); };
  const retryGroups = async () => { await groups.refetch(); };

  return <SafeAreaView style={styles.screen}>
    <ScrollView testID="home-scroll" contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={color.primary} />}>
      <View style={styles.tight}>
        <Label style={[type.subhead, styles.secondary]}>{todayLine(now)}</Label>
        <Label accessibilityRole="header" style={type.title1}>{greeting(name.data)}</Label>
      </View>

      <View style={styles.section}>
        <Label style={[type.overline, styles.secondary]}>UP NEXT</Label>
        {hub.isPending ? <Loading label="Loading your plans…" />
          : !hub.data ? <ErrorState message="Couldn’t load your plans." onRetry={retryHub} />
          : <>
            {hub.isError && <ErrorState message="Couldn’t refresh your plans. Your last results are still here." onRetry={retryHub} />}
            {upNext
              ? <UpNextCard plan={upNext} onOpen={() => router.push(`/plan/${upNext.id}`)} />
              : <Card>
                <Label accessibilityRole="header" style={type.title2}>No plan coming up</Label>
                <Label style={styles.secondary}>When your group confirms a plan you said Going to, it shows up here.</Label>
                <Button label="Find something to do" variant="secondary" size="small" onPress={() => router.navigate('/discover')} />
              </Card>}
          </>}
      </View>

      {hub.data && <View style={styles.section}>
        <Heading title="Needs your input" aside={<Label accessibilityLabel={`${needs.length} waiting`} style={[type.subhead, styles.secondary]}>{needs.length}</Label>} />
        <Card>
          {needs.length === 0
            ? <Label style={styles.secondary}>You’re all caught up. Nothing is waiting on you.</Label>
            : needs.map((item, index) => <NeedsRow key={item.key} item={item} divider={index > 0}
              onPress={() => router.push(item.href as never)} />)}
        </Card>
      </View>}

      <View style={styles.section}>
        <Card>
          <Heading title="Your groups" aside={<Button label="Join with code" variant="text" size="small" onPress={() => router.push('/join')} />} />
          {groups.isPending ? <Loading label="Loading your groups…" />
            : !groups.data ? <ErrorState message="Couldn’t load your groups." onRetry={retryGroups} />
            : <>
              {groups.isError && <ErrorState message="Couldn’t refresh your groups. Showing the last list we loaded." onRetry={retryGroups} />}
              {groups.data.length === 0
                ? <View style={styles.tight}>
                  <Label accessibilityRole="header" style={type.bodyStrong}>No groups yet</Label>
                  <Label style={styles.secondary}>Create a group, or join one with a code from a friend.</Label>
                </View>
                : groups.data.map((group, index) => {
                  const state = groupState(group);
                  return <Pressable key={group.id} accessibilityRole="button" accessibilityLabel={`${group.name}, ${state}`}
                    onPress={() => router.push(`/groups/${group.id}`)} style={[styles.groupRow, index > 0 && styles.divider]}>
                    <IconTile name="users" />
                    <View style={styles.rowText}>
                      <Label style={type.bodyStrong}>{group.name}</Label>
                      <Label style={[type.caption, styles.secondary]}>{state}</Label>
                    </View>
                    <Feather name="chevron-right" size={size.tabIcon} color={color.textSecondary} accessibilityElementsHidden />
                  </Pressable>;
                })}
              <Button label={groups.data?.length ? 'Manage groups' : 'Create a group'} variant="text" size="small"
                onPress={() => router.push(groups.data?.length ? '/groups' : '/groups/new')} />
            </>}
        </Card>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: inset.screen, paddingVertical: space.lg, gap: space.xl, flexGrow: 1 },
  section: { gap: space.sm },
  tight: { gap: space.xxs },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  secondary: { color: color.textSecondary },
  photo: { width: '100%', height: size.homePhoto, borderRadius: radius.sm },
  photoFallback: { backgroundColor: color.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  going: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  needsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, minHeight: minTap, paddingVertical: space.xs },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap, paddingVertical: space.xs },
  rowText: { flex: 1, minWidth: 120, gap: space.xxs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  iconTile: { width: size.iconTile, height: size.iconTile, borderRadius: radius.sm, backgroundColor: color.orangeSoft,
    alignItems: 'center', justifyContent: 'center' },
});
