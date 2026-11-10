import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AsyncView, Button, ConfirmSheet, EmptyState, Notice, Screen, SkeletonList, Tag, Text, MIN_TAP, radius, space, useColors,
} from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { errorCode, messageForError } from '@/shared/lib/errors';
import { formatWhen, timeLeft } from '@/shared/lib/time';
import { useNow } from '@/shared/hooks/useNow';
import { useAuth } from '@/features/auth/AuthProvider';
import { categoryLabel } from '@/features/discovery/categories';
import { BOOKING_NOTICE, priceKindWord, priceShort } from '@/features/discovery/format';
import type { VoteValue } from '@/types/database';
import { cancelPick, castVote, closePick, overridePick, type PickDetail } from './api';
import { usePickDetail } from './hooks';
import { chosenOptionId, newOptionIds, rankOptions, voterProgress, type RankedOption } from './ranking';

const TITLE = 'What should we do this weekend?'; // picks have no title column; every pick uses this question

export function PickScreen({ pickId }: { pickId: string }) {
  const query = usePickDetail(pickId);
  return (
    <Screen edges={[]} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <AsyncView
        query={query}
        errorMessage="Couldn't load the latest votes."
        skeleton={<SkeletonList rows={4} rowHeight={120} />}
        isEmpty={(d) => d === null}
        empty={<EmptyState title="This pick is no longer available" body="It may have been cancelled, or you may have left the group." />}
      >
        {(d) => <PickBody d={d as PickDetail} />}
      </AsyncView>
    </Screen>
  );
}

function PickBody({ d }: { d: PickDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const c = useColors();
  const { userId } = useAuth();
  const now = useNow(15_000);
  const { pick } = d;
  const isOrganizer = pick.organizer_id === userId;

  const [pending, setPending] = useState<Record<string, VoteValue | null>>({});
  const [voteError, setVoteError] = useState<{ message: string; retry: () => void } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'cancel' | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['pick'] });
  const memberIds = d.members.map((m) => m.user_id);
  const progress = voterProgress(memberIds, d.voters);
  const ranked = rankOptions(d.options, d.tallies, pick.starred_option_id);
  const isNew = newOptionIds(d.options, d.myVotes);
  const open = pick.state === 'open';
  const chosen = chosenOptionId(pick);
  const winnerOption = d.options.find((o) => o.id === chosen) ?? null;
  const voteWinner = d.options.find((o) => o.id === pick.winner_option_id) ?? null;

  const myVote = (optionId: string): VoteValue | null =>
    optionId in pending ? pending[optionId] : (d.myVotes[optionId] ?? null);

  async function vote(optionId: string, value: VoteValue) {
    const next = myVote(optionId) === value ? null : value; // tapping the same button again clears the vote
    setVoteError(null);
    setPending((p) => ({ ...p, [optionId]: next }));
    try {
      await castVote(optionId, next);
      await refresh();
    } catch (e) {
      setVoteError({ message: messageForError(e), retry: () => void vote(optionId, value) });
      if (errorCode(e) === 'voting_closed') await refresh();
    } finally {
      setPending((p) => { const { [optionId]: _drop, ...rest } = p; return rest; });
    }
  }

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try { await action(); await refresh(); await qc.invalidateQueries({ queryKey: ['picks'] }); } catch (e) { setActionError(messageForError(e)); }
  }

  const header = (
    <View style={{ gap: space.xs }}>
      <Tag label={d.groupName} tone="info" />
      <Text variant="title" accessibilityRole="header">{TITLE}</Text>
      <Text muted>Started by {d.organizerName}. {d.options.length} options.</Text>
    </View>
  );

  return (
    <View style={{ gap: space.lg }}>
      {header}

      {pick.state === 'cancelled' ? <Notice tone="error" title={`${d.organizerName} cancelled this pick.`} /> : null}

      {open ? (
        <View style={[styles.clock, { backgroundColor: c.card, borderColor: c.border }]} accessibilityLiveRegion="polite">
          <View style={{ flex: 1 }}>
            <Text variant="small" style={{ fontWeight: '600' }}>Closes {formatWhen(pick.deadline)} (Austin time)</Text>
            <Text variant="heading">{new Date(pick.deadline) <= now ? "Time's up. Closing voting…" : timeLeft(pick.deadline, now)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="heading">{progress.voted} of {progress.total}</Text>
            <Text variant="small" muted>voted</Text>
          </View>
        </View>
      ) : null}

      {pick.state === 'closed' || pick.state === 'planned' ? (
        <ResultCard
          d={d} isOrganizer={isOrganizer} winner={winnerOption} voteWinner={voteWinner}
          onPlan={() => router.push(href(`/plan/new?pickId=${pick.id}`))}
          onChoose={(optionId) => run(() => overridePick(pick.id, optionId))}
          onOpenPlan={() => d.planId && router.push(href(`/plan/${d.planId}`))}
          error={actionError}
        />
      ) : null}

      {open && voteError ? (
        <Notice tone="error">{voteError.message}</Notice>
      ) : null}
      {open && voteError && errorCode({ message: voteError.message }) !== 'voting_closed' && voteError.message !== 'Voting closed' ? (
        <Button label="Retry" variant="secondary" onPress={voteError.retry} />
      ) : null}

      <View style={{ gap: space.md }}>
        {(open || pick.state === 'cancelled' ? d.options.map((o) => ranked.find((r) => r.option.id === o.id)!) : ranked).map((r) => (
          <OptionCard
            key={r.option.id}
            r={r}
            organizerName={d.organizerName}
            starred={r.option.id === pick.starred_option_id}
            isWinner={!open && pick.state !== 'cancelled' && r.option.id === chosen}
            isNew={isNew.has(r.option.id)}
            myVote={myVote(r.option.id)}
            canVote={open}
            onVote={(v) => vote(r.option.id, v)}
          />
        ))}
      </View>

      <Notice title="How the winner is chosen">
        {`Yes = 2 points, Maybe = 1, No = 0. If points tie, fewer No votes wins, then ${d.organizerName}'s starred option, then the option added first.`}
      </Notice>

      <View style={{ gap: space.sm }}>
        <View style={styles.rowBetween}>
          <Text variant="bodyStrong" accessibilityRole="header">Who has voted</Text>
          <Text variant="small" muted>{progress.voted} of {progress.total}</Text>
        </View>
        <View style={styles.tags}>
          {d.members.map((m) => (
            <Tag
              key={m.user_id}
              label={`${progress.hasVoted[m.user_id] ? 'Voted' : 'Not yet'}: ${m.name}${m.user_id === userId ? ' (you)' : ''}`}
              tone={progress.hasVoted[m.user_id] ? 'success' : 'neutral'}
            />
          ))}
        </View>
        <Text variant="small" muted>You can see who has voted, not how they voted.</Text>
      </View>

      {actionError && pick.state === 'open' ? <Notice tone="error">{actionError}</Notice> : null}
      {isOrganizer && open ? <Button label="Close voting now" variant="secondary" onPress={() => setConfirm('close')} /> : null}
      {isOrganizer && (open || (pick.state === 'closed')) ? <Button label="Cancel this pick" variant="ghost" onPress={() => setConfirm('cancel')} /> : null}

      <ConfirmSheet
        visible={confirm === 'close'}
        title="Close voting now?"
        body="Votes are final once voting closes, and the winner is decided right away."
        confirmLabel="Close voting"
        onConfirm={() => run(() => closePick(pick.id))}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === 'cancel'}
        title="Cancel this pick?"
        body={`Everyone in ${d.groupName} will see that you cancelled it.`}
        confirmLabel="Cancel pick"
        cancelLabel="Keep pick"
        danger
        onConfirm={() => run(() => cancelPick(pick.id))}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

function ResultCard({ d, isOrganizer, winner, voteWinner, onPlan, onChoose, onOpenPlan, error }: {
  d: PickDetail; isOrganizer: boolean; winner: PickDetail['options'][number] | null; voteWinner: PickDetail['options'][number] | null;
  onPlan: () => void; onChoose: (optionId: string) => void | Promise<unknown>; onOpenPlan: () => void; error: string | null;
}) {
  const c = useColors();
  const { pick } = d;
  const planned = pick.state === 'planned';
  const overridden = pick.override_option_id !== null && voteWinner !== null && pick.override_option_id !== pick.winner_option_id;

  if (!winner) {
    return (
      <View style={[styles.result, { borderColor: c.border, backgroundColor: c.card }]}>
        <Tag label="Voting closed" tone="success" />
        <Text variant="heading">Nobody voted</Text>
        <Text variant="small">{pick.tie_rule ?? 'No votes were cast. The organizer chooses an option.'}</Text>
        {isOrganizer ? (
          <View style={{ gap: space.sm }}>
            <Text variant="small" muted>Choose an option to plan.</Text>
            {d.options.map((o) => <Button key={o.id} label={`Choose ${o.experiences.name}`} variant="secondary" onPress={() => onChoose(o.id)} />)}
          </View>
        ) : (
          <Text variant="small" muted>{d.organizerName} will choose an option.</Text>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </View>
    );
  }

  return (
    <View style={[styles.result, { borderColor: c.success, backgroundColor: c.card }]}>
      <View style={styles.tags}>
        <Tag label="Voting closed" tone="success" />
        {planned ? <Tag label="Planned" tone="info" /> : null}
      </View>
      <Text variant="heading">{winner.experiences.name}</Text>
      {overridden ? (
        <>
          <Text variant="small">{`${d.organizerName} chose ${winner.experiences.name} instead of the vote winner, ${voteWinner!.experiences.name}.`}</Text>
          {pick.tie_rule ? <Text variant="small" muted>Vote result: {pick.tie_rule}</Text> : null}
        </>
      ) : pick.tie_rule ? (
        <Text variant="small">{pick.tie_rule}</Text>
      ) : null}
      {planned ? (
        d.planId ? <Button label="Open the plan" onPress={onOpenPlan} /> : <Text variant="small" muted>A plan was made from this pick.</Text>
      ) : isOrganizer ? (
        <Button label="Plan this" onPress={onPlan} accessibilityHint="Starts a plan draft with this experience and everyone in the group invited" />
      ) : (
        <Text variant="small" muted>{d.organizerName} will send a plan from this result.</Text>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

function OptionCard({ r, organizerName, starred, isWinner, isNew, myVote, canVote, onVote }: {
  r: RankedOption; organizerName: string; starred: boolean; isWinner: boolean; isNew: boolean;
  myVote: VoteValue | null; canVote: boolean; onVote: (v: VoteValue) => void;
}) {
  const c = useColors();
  const e = r.option.experiences;
  const total = r.tally.yes + r.tally.maybe + r.tally.no;
  const price = priceShort(e);
  return (
    <View style={[styles.option, { backgroundColor: c.card, borderColor: isWinner ? c.success : c.border, borderWidth: isWinner ? 2 : 1 }]}>
      <View style={{ gap: 2 }}>
        <View style={styles.tags}>
          {isWinner ? <Tag label="Winner" tone="success" /> : null}
          {isNew ? <Tag label="New option" tone="warn" /> : null}
          {starred ? <Tag label={`${organizerName}'s tie-breaker star`} tone="info" /> : null}
        </View>
        <Text variant="bodyStrong">{e.name}</Text>
        <Text variant="small" muted>
          {categoryLabel(e.category)}, {e.area}  ·  {price}{price !== 'Price unknown' ? ` (${priceKindWord(e).toLowerCase()})` : ''}
          {r.option.proposed_start ? `  ·  ${formatWhen(r.option.proposed_start)}` : ''}
        </Text>
        {e.booking_required ? <Text variant="small" color={c.warn}>{BOOKING_NOTICE}</Text> : null}
      </View>

      {canVote ? <VoteButtons name={e.name} value={myVote} onVote={onVote} /> : null}

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.bar, { backgroundColor: c.skeleton }]}>
        {total > 0 ? (
          <>
            <View style={{ flex: r.tally.yes, backgroundColor: c.success }} />
            <View style={{ flex: r.tally.maybe, backgroundColor: c.warn }} />
            <View style={{ flex: r.tally.no, backgroundColor: c.danger }} />
          </>
        ) : null}
      </View>
      <Text variant="small" accessibilityLabel={`${r.tally.yes} yes, ${r.tally.maybe} maybe, ${r.tally.no} no, ${r.points} points`}>
        <Text variant="bodyStrong">{r.tally.yes}</Text> Yes   <Text variant="bodyStrong">{r.tally.maybe}</Text> Maybe   <Text variant="bodyStrong">{r.tally.no}</Text> No   ·   {r.points} pts
      </Text>
    </View>
  );
}

const VOTES: { value: VoteValue; label: string }[] = [{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' }];

function VoteButtons({ name, value, onVote }: { name: string; value: VoteValue | null; onVote: (v: VoteValue) => void }) {
  const c = useColors();
  return (
    <View style={styles.vote} accessibilityRole="radiogroup" accessibilityLabel={`Your vote for ${name}`}>
      {VOTES.map((v) => {
        const on = value === v.value;
        return (
          <Pressable
            key={v.value}
            onPress={() => onVote(v.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={on ? `${v.label}, your vote. Tap again to clear` : v.label}
            style={[styles.voteBtn, { backgroundColor: on ? c.primary : c.card, borderColor: on ? c.primary : c.border }]}
          >
            <Text variant="bodyStrong" color={on ? c.onPrimary : c.text}>{on ? `✓ ${v.label}` : v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  clock: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderWidth: 1, borderRadius: radius.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  result: { borderWidth: 2, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  vote: { flexDirection: 'row', gap: space.sm },
  voteBtn: { flex: 1, minHeight: MIN_TAP + 4, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
});
