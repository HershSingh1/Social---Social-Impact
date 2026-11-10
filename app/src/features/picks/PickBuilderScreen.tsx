import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button, EmptyState, Notice, OptionSheet, Screen, SkeletonList, Tag, Text, WhenPicker, MIN_TAP, radius, space, useColors,
} from '@/shared/ui';
import { href, signInHref } from '@/shared/lib/nav';
import { errorCode, messageForCode, messageForError } from '@/shared/lib/errors';
import { formatWhen } from '@/shared/lib/time';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyGroups } from '@/features/groups/hooks';
import { categoryLabel } from '@/features/discovery/categories';
import { priceShort } from '@/features/discovery/format';
import { createPick } from './api';
import { deadlineError, resolveDeadline, type DeadlineChoice } from './builderState';
import { useOpenPickForGroup } from './hooks';
import { usePickBuilder } from './PickBuilder';
import { MAX_OPTIONS, MIN_OPTIONS } from './ranking';

const HOURS = [6, 12, 24, 48] as const;

/** P0-08 steps 2 to 6: choose the group, review 2-5 options, optional star, deadline, Open voting. */
export function PickBuilderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const c = useColors();
  const { isAccount } = useAuth();
  const { state, dispatch } = usePickBuilder();
  const groups = useMyGroups();
  const openPick = useOpenPickForGroup(state.groupId);
  const [groupSheet, setGroupSheet] = useState(false);
  const [failure, setFailure] = useState<{ message: string; pickId?: string } | null>(null);

  const list = groups.data ?? [];
  const group = list.find((g) => g.id === state.groupId) ?? null;

  // someone in exactly one group never has to choose
  useEffect(() => {
    if (!state.groupId && list.length === 1) dispatch({ type: 'setGroup', groupId: list[0].id });
  }, [state.groupId, list, dispatch]);

  const dlError = deadlineError(state.deadline);
  const blocked = !!openPick.data;
  const canOpen = isAccount && !!group && state.items.length >= MIN_OPTIONS && state.items.length <= MAX_OPTIONS && !dlError && !blocked;
  const closes = resolveDeadline(state.deadline);

  async function openVoting() {
    if (!group) return;
    setFailure(null);
    try {
      const id = await createPick({
        groupId: group.id,
        options: state.items.map((i) => ({ experience_id: i.experience.id, proposed_start: i.proposedStart })),
        deadline: resolveDeadline(state.deadline),
        starred: state.starred === null ? null : state.starred + 1, // the server counts positions from 1
      });
      dispatch({ type: 'reset' });
      await qc.invalidateQueries({ queryKey: ['openPick'] });
      await qc.invalidateQueries({ queryKey: ['picks'] });
      router.replace(href(`/pick/${id}`));
    } catch (e) {
      const details = (e as { details?: string } | null)?.details;
      setFailure({ message: messageForError(e), pickId: errorCode(e) === 'open_pick_exists' ? details : undefined });
    }
  }

  if (!isAccount) {
    return (
      <Screen edges={[]}>
        <EmptyState
          title="Sign in to start a group pick"
          body="Anyone in the group can vote, guests included. Starting a pick needs an account."
          actionLabel="Sign in"
          onAction={() => router.push(signInHref('/pick/new'))}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        {groups.data === undefined && groups.isPending ? <SkeletonList rows={3} /> : null}
        {groups.data !== undefined && list.length === 0 ? (
          <EmptyState
            title="Create or join a group first"
            body="A pick belongs to a group of friends who vote on it."
            actionLabel="Go to Friends"
            onAction={() => router.replace(href('/friends'))}
          />
        ) : null}

        {list.length > 0 ? (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">New group pick</Text>
              <Text muted>Pick 2 to 5 options. Everyone in the group votes Yes, Maybe or No on each.</Text>
            </View>

            <View style={styles.rowBetween}>
              {group ? <Tag label={`${group.name}, ${group.memberCount} people`} tone="info" /> : <Text muted>Choose a group</Text>}
              {list.length > 1 ? (
                <Button label={group ? 'Change group' : 'Choose group'} variant="secondary" onPress={() => setGroupSheet(true)} />
              ) : null}
            </View>

            {blocked ? (
              <Notice tone="error" title={`${group?.name ?? 'This group'} already has an open pick`}>
                Only one pick can be open at a time. Vote in it, or ask its organizer to close it.
              </Notice>
            ) : null}
            {blocked ? <Button label="View the open pick" variant="secondary" onPress={() => router.push(href(`/pick/${openPick.data!.id}`))} /> : null}

            <View style={{ gap: space.sm }}>
              <View style={styles.rowBetween}>
                <Text variant="bodyStrong" accessibilityRole="header">Options</Text>
                <Text variant="small" muted>{state.items.length} of {MAX_OPTIONS}</Text>
              </View>
              {state.items.length === 0 ? (
                <Notice>No options yet. Browse the map, open an experience and tap "Add to group pick".</Notice>
              ) : (
                state.items.map((item, i) => {
                  const starred = state.starred === i;
                  return (
                    <View key={`${item.experience.id}-${i}`} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                      <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong">{item.experience.name}</Text>
                          <Text variant="small" muted>{categoryLabel(item.experience.category)}, {item.experience.area}  ·  {priceShort(item.experience)}</Text>
                          <Text variant="small" muted>{i === 0 ? 'Added first' : `Added #${i + 1}`}{starred ? ', tie-breaker star' : ''}</Text>
                        </View>
                        <Pressable
                          onPress={() => dispatch({ type: 'setStar', index: i })}
                          accessibilityRole="button"
                          accessibilityLabel={`Tie-breaker star for ${item.experience.name}`}
                          accessibilityState={{ selected: starred }}
                          style={[styles.iconBtn, { borderColor: starred ? c.primary : c.border, backgroundColor: starred ? c.primarySoft : 'transparent' }]}
                        >
                          <Text variant="small" color={starred ? c.primary : c.text} style={{ fontWeight: '700' }}>{starred ? 'Starred' : 'Star'}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => dispatch({ type: 'remove', index: i })}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.experience.name}`}
                          style={[styles.iconBtn, { borderColor: c.border }]}
                        >
                          <Text variant="small">Remove</Text>
                        </Pressable>
                      </View>
                      <WhenPicker
                        label="Proposed start (optional)"
                        valueIso={item.proposedStart}
                        clearable
                        onChange={(iso) => dispatch({ type: 'setTime', index: i, iso })}
                      />
                    </View>
                  );
                })
              )}
              {state.items.length < MAX_OPTIONS ? (
                <Button label="Add another experience" variant="secondary" onPress={() => router.navigate(href('/'))} />
              ) : null}
              {state.items.length === 1 ? <Text variant="small" muted>Add at least one more to open voting.</Text> : null}
            </View>

            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong" accessibilityRole="header">Voting closes in</Text>
              <View style={styles.hours} accessibilityRole="radiogroup">
                {HOURS.map((h) => {
                  const on = state.deadline.kind === 'hours' && state.deadline.hours === h;
                  return <Choice key={h} label={`${h} hours`} on={on} onPress={() => dispatch({ type: 'setDeadline', deadline: { kind: 'hours', hours: h } })} />;
                })}
                <Choice
                  label="Custom"
                  on={state.deadline.kind === 'custom'}
                  onPress={() => dispatch({ type: 'setDeadline', deadline: { kind: 'custom', iso: new Date(Date.now() + 36 * 3_600_000).toISOString() } as DeadlineChoice })}
                />
              </View>
              {state.deadline.kind === 'custom' ? (
                <WhenPicker
                  label="Closing time"
                  valueIso={state.deadline.iso}
                  days={8}
                  error={dlError}
                  onChange={(iso) => iso && dispatch({ type: 'setDeadline', deadline: { kind: 'custom', iso } })}
                />
              ) : null}
              <Text variant="small" muted>Closes {formatWhen(closes)} Austin time. 24 hours is the default.</Text>
            </View>

            <Notice title="Tie-breaker, shown to everyone">
              Yes = 2 points, Maybe = 1, No = 0. If points tie: fewer No votes wins, then your starred option, then the option added first.
            </Notice>

            {failure ? <Notice tone="error">{failure.message}</Notice> : null}
            {failure?.pickId ? <Button label="View the open pick" variant="secondary" onPress={() => router.push(href(`/pick/${failure.pickId}`))} /> : null}
            <Button
              label={`Open voting for ${state.items.length} option${state.items.length === 1 ? '' : 's'}`}
              onPress={openVoting}
              disabled={!canOpen}
            />
            {state.items.length > 0 ? <Button label="Start over" variant="ghost" onPress={() => dispatch({ type: 'reset' })} /> : null}
          </>
        ) : null}

        <OptionSheet
          visible={groupSheet}
          title="Which group?"
          value={state.groupId ?? ''}
          options={list.map((g) => ({ id: g.id, label: g.name, hint: `${g.memberCount} people` }))}
          onSelect={(id) => dispatch({ type: 'setGroup', groupId: id })}
          onClose={() => setGroupSheet(false)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}${on ? ', selected' : ''}`}
      style={[styles.choice, { backgroundColor: on ? c.primary : c.card, borderColor: on ? c.primary : c.border }]}
    >
      <Text variant="small" color={on ? c.onPrimary : c.text} style={{ fontWeight: '700' }}>{on ? `✓ ${label}` : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.md },
  iconBtn: { minHeight: MIN_TAP, minWidth: MIN_TAP, paddingHorizontal: space.sm, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { minHeight: MIN_TAP, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
