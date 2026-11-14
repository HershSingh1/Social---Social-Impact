import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';
import { Empty, ErrorState, Label, Loading } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { groupIdeas, savedByLine, useSaves } from '../discovery/saves';
import { useExperiences } from '../discovery/useExperiences';
import { names } from './overview';

type Props = { groupId: string; userId: string; onOpenExperience: (experienceId: string) => void };

// "Saved ideas" on the group page (P0-07). Each experience appears once, with who saved it. RLS only returns
// group saves to current members, and personal saves never come back from this query's group filter.
export function SavedIdeas({ groupId, userId, onOpenExperience }: Props) {
  const saves = useSaves(userId);
  const catalog = useExperiences();
  const ideas = saves.data ? groupIdeas(saves.data, groupId) : [];
  const saverIds = [...new Set(ideas.flatMap(idea => idea.savers).filter(id => id !== userId))].sort();
  const people = useQuery({ queryKey: ['saver-names', groupId, saverIds], enabled: saverIds.length > 0, queryFn: () => names(saverIds) });

  if (saves.isPending || catalog.isPending) return <Loading label="Loading saved ideas…" />;
  if (!saves.data || !catalog.data) {
    return <ErrorState message="Couldn’t load saved ideas." onRetry={async () => { await Promise.all([saves.refetch(), catalog.refetch()]); }} />;
  }
  const experiences = new Map(catalog.data.map(e => [e.id, e]));
  // A listing that was removed from the catalog can't be opened, so it isn't listed.
  const shown = ideas.filter(idea => experiences.has(idea.experienceId));
  const nameOf = (id: string) => people.data?.get(id) ?? 'a member';

  return <View>
    {(saves.isError || catalog.isError) && <ErrorState message="Couldn’t refresh saved ideas. Showing what we loaded last."
      onRetry={async () => { await Promise.all([saves.refetch(), catalog.refetch()]); }} />}
    {shown.length === 0
      ? <Empty title="No saved ideas yet" description="Open an activity and tap Save to add it here for the whole group." />
      : shown.map(idea => {
        const experience = experiences.get(idea.experienceId)!;
        const by = savedByLine(idea.savers, userId, nameOf);
        return <Pressable key={idea.experienceId} accessibilityRole="button" accessibilityLabel={`${experience.name}. ${by}. Open details`}
          onPress={() => onOpenExperience(idea.experienceId)} style={styles.row}>
          <Label style={type.bodyStrong}>{experience.name}</Label>
          <Label style={styles.caption}>{by}</Label>
        </Pressable>;
      })}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: minTap, justifyContent: 'center', gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
});
