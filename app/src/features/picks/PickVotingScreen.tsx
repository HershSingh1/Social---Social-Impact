import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AvatarStack, Button, Card, Chip, ErrorState, Label, Loading, Screen, Tag } from '@/ui';
import { color, radius, space, type } from '@/ui/theme';
import { useAuth } from '@/features/auth';
import { addOptionToPick, castVote, fetchExperience, pickKey, usePick, type PickDetail } from './api';
import { planThisPath, toggledVote, votePoints, type VoteValue } from './model';
import { PickOrganizerActions } from './PickOrganizerActions';
import { PickResultScreen } from './PickResultScreen';

function updateVote(pick: PickDetail, optionId: string, next: VoteValue | null): PickDetail {
  return { ...pick, options: pick.options.map(option => {
    if (option.id !== optionId) return option;
    const tally = { ...option.tally };
    if (option.myVote) tally[option.myVote]--;
    if (next) tally[next]++;
    return { ...option, tally, myVote: next ?? undefined };
  }) };
}

export function PickVotingScreen() {
  const { id = '', addExperienceId } = useLocalSearchParams<{ id: string; addExperienceId?: string }>();
  const query = usePick(id); const client = useQueryClient();
  const { session } = useAuth(); const viewerId = session?.user.id ?? '';
  const addition = useQuery({ queryKey: ['experience', addExperienceId], queryFn: () => fetchExperience(addExperienceId!), enabled: Boolean(addExperienceId) });
  const [failed, setFailed] = useState<{ optionId: string; value: VoteValue | null }>();
  const mutation = useMutation({ mutationFn: ({ optionId, value }: { optionId: string; value: VoteValue | null }) => castVote(optionId, value),
    onMutate: async variables => { await client.cancelQueries({ queryKey: pickKey(id) }); const previous = client.getQueryData<PickDetail>(pickKey(id));
      if (previous) client.setQueryData(pickKey(id), updateVote(previous, variables.optionId, variables.value)); return { previous }; },
    onError: (_error, variables, context) => { if (context?.previous) client.setQueryData(pickKey(id), context.previous); setFailed(variables); },
    onSuccess: () => setFailed(undefined), onSettled: () => client.invalidateQueries({ queryKey: pickKey(id) }) });
  const addMutation = useMutation({ mutationFn: () => addOptionToPick(id, addExperienceId!),
    onSuccess: () => client.invalidateQueries({ queryKey: pickKey(id) }) });
  if (query.isLoading) return <Screen><Loading label="Loading group pick…" /></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message="Couldn’t load this pick." onRetry={async () => { await query.refetch(); }} /></Screen>;
  const pick = query.data; const closed = pick.state !== 'open' || new Date(pick.deadline).getTime() <= query.dataUpdatedAt;
  const complete = pick.voters.filter(voter => voter.complete); const hasAnyVote = pick.options.some(option => option.myVote);
  const refresh = () => { void client.invalidateQueries({ queryKey: pickKey(id) }); };
  // Closed, planned or cancelled: the same result on every phone.
  if (pick.state !== 'open') return <Screen>
    <View style={styles.center}><Label accessibilityRole="header" style={type.title2}>Result</Label><Label style={styles.secondary}>{pick.title}</Label></View>
    <PickResultScreen pick={pick} viewerId={viewerId} onChanged={refresh}
      onOpenPlan={planId => router.push(`/plan/${planId}`)}
      onPlanThis={optionId => { const option = pick.options.find(o => o.id === optionId); if (option) router.push(planThisPath(pick, option) as never); }} />
  </Screen>;
  return <Screen>
    <View style={styles.center}><Label accessibilityRole="header" style={type.title2}>Vote</Label><Label style={styles.secondary}>{pick.title}</Label></View>
    <Card><View style={styles.row}><View style={styles.grow}><Label style={type.bodyStrong}>{closed ? 'Voting closed' : `Closes ${new Date(pick.deadline).toLocaleString()}`}</Label>
      <Label style={styles.secondary}>{complete.length} of {pick.voters.length} voted</Label></View>{closed && <Tag label="Voting closed" variant="dark" />}</View>
      {!!complete.length && <><AvatarStack people={complete.map(voter => ({ id: voter.id, name: voter.name, uri: voter.avatar }))} size="xs" />
        <Label style={styles.secondary}>{complete.map(voter => voter.name).join(', ')} voted</Label></>}
    </Card>
    {addExperienceId && !closed && <Card><Label style={type.bodyStrong}>{addition.data?.name ?? 'Add this activity'}</Label>
      <Label>Only this pick’s organizer can add a new option.</Label>
      <Button label={addMutation.isSuccess ? 'Added to pick' : 'Add to this pick'} disabled={addMutation.isSuccess || addition.isLoading}
        errorMessage="Couldn’t add this option. The organizer can try again." onPress={() => addMutation.mutateAsync()} /></Card>}
    <Label style={type.overline}>PICK YES, MAYBE OR NO FOR EACH</Label>
    {pick.options.map(option => { const total = option.tally.yes + option.tally.maybe + option.tally.no; const max = Math.max(total, pick.voters.length, 1);
      const isNew = hasAnyVote && !option.myVote; return <Card key={option.id}>
        <View style={styles.row}><View style={styles.grow}><View style={styles.titleRow}><Label style={type.bodyStrong}>{option.name}</Label>{isNew && <Tag label="New option" />}</View>
          {!!option.detail && <Label style={styles.secondary}>{option.detail}</Label>}</View><Label style={type.captionStrong}>{votePoints(option.tally)} points</Label></View>
        <View style={styles.bar} accessible accessibilityLabel={`${option.tally.yes} Yes, ${option.tally.maybe} Maybe, ${option.tally.no} No`}>
          <View style={[styles.barYes, { flex: option.tally.yes * 2 }]} /><View style={[styles.barMaybe, { flex: option.tally.maybe }]} />
          <View style={{ flex: Math.max(max * 2 - option.tally.yes * 2 - option.tally.maybe, 0.01) }} />
        </View>
        <View style={styles.wrap}>{(['yes', 'maybe', 'no'] as const).map(value => <Chip key={value}
          label={`${value[0].toUpperCase()}${value.slice(1)} · ${option.tally[value]}`} selected={option.myVote === value} disabled={closed || mutation.isPending}
          onPress={() => mutation.mutate({ optionId: option.id, value: toggledVote(option.myVote, value) })} />)}</View>
        {failed?.optionId === option.id && <View style={styles.failure}><Label accessibilityRole="alert">Couldn’t save your vote.</Label>
          <Button label="Retry" variant="secondary" size="small" onPress={() => mutation.mutateAsync(failed)} /></View>}
      </Card>; })}
    <Card><Label style={type.bodyStrong}>Built-in tie-breaker</Label><Label>If points tie, fewer No votes wins, then the starred option, then the option added first.</Label></Card>
    {closed && <Label accessibilityRole="alert" style={styles.centerText}>Voting closed</Label>}
    {pick.organizerId === viewerId && <PickOrganizerActions pickId={pick.id} allowClose={!closed} onDone={refresh} />}
  </Screen>;
}

export { updateVote };
const styles = StyleSheet.create({
  center: { alignItems: 'center' }, centerText: { textAlign: 'center', ...type.bodyStrong }, secondary: { color: color.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  grow: { flex: 1, gap: space.xs }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: color.muted, flexDirection: 'row', overflow: 'hidden' },
  barYes: { backgroundColor: color.primary }, barMaybe: { backgroundColor: color.orange }, failure: { gap: space.sm },
});
