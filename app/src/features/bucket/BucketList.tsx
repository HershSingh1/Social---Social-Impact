// Bucket list on the group page, next to Saved ideas (P2-05, frames A and B). Counts only, never who.
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Tag } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { useExperiences } from '../discovery/useExperiences';
import { draftHref } from '../plans/drafts';
import { bucketKey, fetchBucketList, wantLine } from './bucket';

export function BucketList({ groupId, userId }: { groupId: string; userId: string }) {
  const list = useQuery({ queryKey: bucketKey(groupId), queryFn: () => fetchBucketList(groupId, userId) });
  const catalog = useExperiences();
  const retry = async () => { await Promise.all([list.refetch(), catalog.refetch()]); };

  if (list.isPending || catalog.isPending) return <Card><Label accessibilityRole="header" style={type.title2}>Bucket list</Label><Loading label="Loading the bucket list…" /></Card>;
  if (!list.data || !catalog.data) return <Card><Label accessibilityRole="header" style={type.title2}>Bucket list</Label><ErrorState message="Couldn’t load the bucket list." onRetry={retry} /></Card>;

  const experiences = new Map(catalog.data.map(e => [e.id, e]));
  // A listing that was removed from the catalog can't be opened or planned, so it isn't listed.
  const shown = list.data.filter(item => experiences.has(item.experienceId));
  return <Card>
    <Label accessibilityRole="header" style={type.title2}>Bucket list</Label>
    {(list.isError || catalog.isError) && <ErrorState message="Couldn’t refresh the bucket list. Showing what we loaded last." onRetry={retry} />}
    {shown.length === 0
      ? <>
        <Empty title="Nothing on the bucket list yet" description="Open an activity and tap Want to do someday. The most wanted show up here." />
        <Button label="Find something to do" onPress={() => router.push('/discover' as Href)} />
      </>
      : shown.map((item, index) => {
        const experience = experiences.get(item.experienceId)!;
        return <View key={item.experienceId} style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${experience.name}. ${wantLine(item.wantCount)}. Open details`}
            onPress={() => router.push(`/experience/${item.experienceId}` as Href)} style={styles.link}>
            <Label style={type.bodyStrong}>{experience.name}</Label>
            <Label style={styles.caption}>{experience.category}</Label>
          </Pressable>
          <View style={styles.tag}><Tag label={wantLine(item.wantCount)} variant={index === 0 ? 'dark' : 'neutral'} /></View>
          <View style={styles.actions}>
            <Button label="Start a pick" size="small" accessibilityLabel={`Start a pick with ${experience.name}`}
              onPress={() => router.push({ pathname: '/pick/new', params: { experienceId: item.experienceId, groupId } } as Href)} />
            <Button label="Start a plan" size="small" variant="secondary" accessibilityLabel={`Start a plan for ${experience.name}`}
              onPress={() => router.push(draftHref({ groupId, experienceId: item.experienceId }) as Href)} />
          </View>
        </View>;
      })}
  </Card>;
}

const styles = StyleSheet.create({
  row: { gap: space.xs, paddingVertical: space.sm },
  link: { minHeight: minTap, justifyContent: 'center', gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
  tag: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
