// Figma: 4145:17286 P0-08 · Start a group pick (file MkYNxuYFuktTR0yGExJnK7; see docs/figma-frames.md).
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorState, Label, Loading, Screen, Tag } from '@/ui';
import { color, minTap, space, type } from '@/ui/theme';
import { clearDraft, createPick, fetchExperience, fetchGroups, loadDraft, saveDraft } from './api';
import { TimeField } from '../plans/TimeField';
import {
  addDraftOption, deadlineFor, deadlineLabel, defaultCustomDeadline, defaultProposedStart, EMPTY_DRAFT, removeDraftOption,
  validateDraft, withoutBadTimes, type PickDraft,
} from './model';

export function PickBuilderScreen() {
  const { experienceId, groupId } = useLocalSearchParams<{ experienceId?: string; groupId?: string }>();
  const groups = useQuery({ queryKey: ['my-groups'], queryFn: fetchGroups });
  const [draft, setDraft] = useState<PickDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string>();
  const [openPickId, setOpenPickId] = useState<string>();
  const [clientKey] = useState(randomUUID);

  useEffect(() => { void loadDraft().then(value => { setDraft(withoutBadTimes(value)); setHydrated(true); }); }, []);
  useEffect(() => {
    if (!hydrated || !experienceId) return;
    // Opened from a group's bucket list: that group is already chosen.
    void fetchExperience(experienceId).then(option => setDraft(current => ({ ...addDraftOption(current, option), ...(groupId ? { groupId } : {}) })))
      .catch(() => setError('Couldn’t add that activity. Try again.'));
  }, [experienceId, groupId, hydrated]);
  useEffect(() => { if (hydrated) void saveDraft(draft); }, [draft, hydrated]);
  const effectiveDraft = useMemo(() => draft.groupId || groups.data?.length !== 1
    ? draft : { ...draft, groupId: groups.data[0].id }, [draft, groups.data]);
  const validation = useMemo(() => validateDraft(effectiveDraft), [effectiveDraft]);
  const deadline = deadlineFor(draft);
  const setProposedStart = (experienceId: string, proposedStart?: string) => setDraft(current => ({ ...current,
    options: current.options.map(item => item.experienceId === experienceId ? { ...item, proposedStart } : item) }));
  const mutation = useMutation({ mutationFn: async () => {
    const deadline = deadlineFor(effectiveDraft); if (!deadline) throw new Error('Enter a valid deadline.');
    return createPick(effectiveDraft, clientKey, deadline);
  }, onSuccess: async id => { await clearDraft(); router.replace(`/pick/${id}`); },
  onError: (reason: Error & { details?: string }) => {
    if (reason.message.includes('open_pick_exists')) { setOpenPickId(reason.details); setError('This group already has an open pick.'); }
    else setError(reason.message.includes('voting_closed') ? 'Voting closed' : 'Couldn’t open voting. Try again.');
  }});

  if (!hydrated || groups.isLoading) return <Screen><Loading label="Loading pick builder…" /></Screen>;
  if (groups.isError) return <Screen><ErrorState message="Couldn’t load your groups." onRetry={async () => { await groups.refetch(); }} /></Screen>;
  if (!groups.data?.length) return <Screen><Empty title="No groups yet" description="Create or join a group before starting a pick." /></Screen>;
  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Start a group pick</Label>
    <Label>Collect 2–5 ideas, then let the group vote Yes, Maybe or No.</Label>
    {groups.data.length > 1 && <View style={styles.section}>
      <Label style={type.overline}>GROUP</Label><View style={styles.wrap}>{groups.data.map(group =>
        <Chip key={group.id} label={group.name} selected={effectiveDraft.groupId === group.id}
          onPress={() => setDraft(current => ({ ...current, groupId: group.id }))} />)}</View>
    </View>}
    <View style={styles.section}>
      <View style={styles.row}><Label style={type.title2}>Options</Label><Tag label={`${draft.options.length} of 5`} /></View>
      {!draft.options.length && <Card><Label style={type.bodyStrong}>No ideas yet</Label><Label>Open an activity in Discover and tap Add to group pick.</Label></Card>}
      {draft.options.map((option, index) => <Card key={option.experienceId}>
        <View style={styles.row}><View style={styles.grow}>
          <Label style={type.bodyStrong}>{index + 1}. {option.name}</Label>{option.detail && <Label style={styles.secondary}>{option.detail}</Label>}
        </View><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${option.name}`} hitSlop={8}
          onPress={() => setDraft(current => removeDraftOption(current, option.experienceId))} style={styles.tap}><Label>Remove</Label></Pressable></View>
        {option.proposedStart ? <>
          <TimeField label="Proposed time" value={option.proposedStart} onChange={d => setProposedStart(option.experienceId, d.toISOString())} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove the proposed time for ${option.name}`}
            onPress={() => setProposedStart(option.experienceId)} style={styles.tap}><Label style={styles.link}>Remove time</Label></Pressable>
        </> : <Pressable accessibilityRole="button" accessibilityLabel={`Add a proposed time for ${option.name}`}
          onPress={() => setProposedStart(option.experienceId, defaultProposedStart())} style={styles.tap}>
          <Label style={styles.link}>+ Add a proposed time (optional)</Label></Pressable>}
        <Chip label="Star as tie-break favorite" selected={draft.starredExperienceId === option.experienceId}
          onPress={() => setDraft(current => ({ ...current, starredExperienceId: current.starredExperienceId === option.experienceId ? undefined : option.experienceId }))} />
      </Card>)}
      {draft.options.length < 5 && <Link href="/discover" asChild><Pressable style={styles.tap}><Label style={styles.link}>+ Add another from Discover</Label></Pressable></Link>}
    </View>
    <View style={styles.section}><Label style={type.title2}>Voting deadline</Label>
      <View style={styles.wrap}>{([6, 12, 24, 48] as const).map(hours => <Chip key={hours} label={`${hours} hours`}
        selected={draft.deadlineHours === hours} onPress={() => setDraft(current => ({ ...current, deadlineHours: hours }))} />)}
        <Chip label="Custom" selected={draft.deadlineHours === 'custom'} onPress={() => setDraft(current => ({ ...current,
          deadlineHours: 'custom', customDeadline: current.customDeadline ?? defaultCustomDeadline() }))} />
      </View>
      {draft.deadlineHours === 'custom' && draft.customDeadline && <TimeField label="Custom deadline" value={draft.customDeadline}
        error={validation?.startsWith('Deadline') ? validation : undefined}
        onChange={d => setDraft(current => ({ ...current, customDeadline: d.toISOString() }))} />}
      {deadline && <Label style={styles.secondary}>{deadlineLabel(deadline)}</Label>}
    </View>
    {(error || (validation && draft.options.length >= 2)) && <Label accessibilityRole="alert" style={styles.error}>{error ?? validation}</Label>}
    {openPickId && <Link href={experienceId ? `/pick/${openPickId}?addExperienceId=${experienceId}` : `/pick/${openPickId}`} asChild>
      <Pressable style={styles.tap}><Label style={styles.link}>Open the existing pick</Label></Pressable></Link>}
    <Button label={`Open voting · ${draft.options.length} options`} loading={mutation.isPending} disabled={Boolean(validation)}
      onPress={async () => { setError(undefined); setOpenPickId(undefined); await mutation.mutateAsync(); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: space.md }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  grow: { flex: 1, gap: space.xs }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  secondary: { color: color.textSecondary }, tap: { minHeight: minTap, justifyContent: 'center' },
  link: { color: color.primary, ...type.bodyStrong }, error: { color: color.orangeInk },
});
