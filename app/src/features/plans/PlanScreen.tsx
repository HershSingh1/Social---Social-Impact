import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AsyncView, Button, EmptyState, Notice, Screen, SkeletonList, Tag, Text, MIN_TAP, radius, space, useColors } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { errorCode, messageForError } from '@/shared/lib/errors';
import { formatDay, formatTimeRange } from '@/shared/lib/time';
import { useNow } from '@/shared/hooks/useNow';
import { useAuth } from '@/features/auth/AuthProvider';
import { BookingNotice } from '@/features/discovery/BookingNotice';
import { priceLabel } from '@/features/discovery/format';
import { respond, type EditResult, type PlanDetail } from './api';
import { EditPlanSheet } from './EditPlanSheet';
import { usePlanDetail } from './hooks';
import { countRsvps, STATUS_LABEL, STATUS_TONE } from './rsvp';

export function PlanScreen({ planId }: { planId: string }) {
  const query = usePlanDetail(planId);
  return (
    <Screen edges={[]} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <AsyncView
        query={query}
        errorMessage="Couldn't load this plan."
        skeleton={<SkeletonList rows={4} rowHeight={88} />}
        isEmpty={(d) => d === null}
        empty={
          <EmptyState
            title="This plan isn't available to you"
            body="Plans are only visible to the people who were invited. Joining the group later doesn't add you to a plan."
          />
        }
      >
        {(d) => <PlanBody d={d as PlanDetail} />}
      </AsyncView>
    </Screen>
  );
}

function PlanBody({ d }: { d: PlanDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const c = useColors();
  const { userId } = useAuth();
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const now = useNow(30_000);
  const { plan, current, previous } = d;

  const [pending, setPending] = useState<'going' | 'cant_go' | null>(null);
  const [rsvpError, setRsvpError] = useState<{ message: string; retry: () => void } | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const isOrganizer = plan.organizer_id === userId;
  const mine = d.rsvps.find((r) => r.user_id === userId);
  const counts = countRsvps(d.rsvps);
  const cancelled = plan.state === 'cancelled';
  const started = new Date(current.start_at).getTime() <= now.getTime();
  const locked = cancelled || started;
  const needsReconfirm = !isOrganizer && mine?.status === 'needs_reconfirm' && !locked;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['plan'] }), qc.invalidateQueries({ queryKey: ['plans'] })]);

  async function answer(status: 'going' | 'cant_go') {
    if (pending) return;
    setPending(status);
    setRsvpError(null);
    try {
      // not optimistic: the answer shows as saved only after the server confirms it
      await respond(plan.id, plan.current_revision, status);
      await refresh();
    } catch (e) {
      setRsvpError({ message: messageForError(e), retry: () => void answer(status) });
      const code = errorCode(e);
      if (code === 'stale_revision' || code === 'plan_cancelled' || code === 'answers_locked') await refresh(); // reload and ask again
    } finally {
      setPending(null);
    }
  }

  const priceText = priceLabel(current.price_snapshot);
  const changedTime = previous && (previous.start_at !== current.start_at || previous.end_at !== current.end_at);
  const changedMeet = previous && previous.meeting_point !== current.meeting_point;
  const whenNow = `${formatDay(current.start_at)}, ${formatTimeRange(current.start_at, current.end_at)}`;

  return (
    <View style={{ gap: space.lg }}>
      {sent === '1' ? <Notice tone="success" title="Invitations sent">{`${counts.going} Going, ${counts.awaiting} Awaiting reply.`}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}

      <View style={{ gap: space.xs }}>
        <Tag label={d.groupName} tone="info" />
        <Text variant="title" accessibilityRole="header">{d.experience.name}</Text>
        <Text muted>Organized by {d.organizerName}</Text>
      </View>

      {cancelled ? (
        <Notice tone="error" title={`${d.organizerName} cancelled this plan.`}>
          {plan.cancel_reason ? `${plan.cancel_reason}. Responses are closed.` : 'Responses are closed.'}
        </Notice>
      ) : null}

      {needsReconfirm ? (
        <View style={[styles.reconfirm, { backgroundColor: c.warnSoft, borderColor: c.warn }]} accessibilityRole="alert">
          <Text variant="bodyStrong" color={c.warn}>The plan changed. Are you still going?</Text>
          {previous && changedTime ? (
            <Text>Time: <Text style={{ textDecorationLine: 'line-through' }} muted>{`${formatDay(previous.start_at)}, ${formatTimeRange(previous.start_at, previous.end_at)}`}</Text>{'  →  '}<Text variant="bodyStrong">{whenNow}</Text></Text>
          ) : null}
          {previous && changedMeet ? (
            <Text>Meet: <Text style={{ textDecorationLine: 'line-through' }} muted>{previous.meeting_point}</Text>{'  →  '}<Text variant="bodyStrong">{current.meeting_point}</Text></Text>
          ) : null}
          <AnswerButtons pending={pending} current="needs_reconfirm" onAnswer={answer} goingLabel="Still going" disabled={false} />
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Fact label="When, Austin time" value={whenNow} note={changedTime && previous ? `Changed from ${formatDay(previous.start_at)}, ${formatTimeRange(previous.start_at, previous.end_at)}` : undefined} />
        <Fact label="Meeting point" value={current.meeting_point} note={`${d.experience.area}`} />
        {current.note ? <Fact label="Note" value={current.note} /> : null}
        <Fact label="Cost" value={priceText} />
      </View>
      <BookingNotice required={current.booking_required} url={d.experience.booking_url} />

      {!isOrganizer && !needsReconfirm ? (
        <View style={{ gap: space.sm }}>
          <View style={styles.rowBetween}>
            <Text variant="bodyStrong" accessibilityRole="header">Your response</Text>
            {mine ? <Tag label={STATUS_LABEL[mine.status]} tone={STATUS_TONE[mine.status]} /> : null}
          </View>
          <AnswerButtons pending={pending} current={mine?.status ?? 'awaiting'} onAnswer={answer} goingLabel="Going" disabled={locked} />
          <Text variant="small" muted>
            {cancelled ? 'Responses closed because the plan was cancelled.' : started ? 'This plan has started, so answers are locked.' : 'You can change this until the plan starts.'}
          </Text>
        </View>
      ) : null}
      {rsvpError ? <Notice tone="error">{rsvpError.message}</Notice> : null}
      {rsvpError && errorCode({ message: rsvpError.message }) !== 'stale_revision' && !/just changed|started|cancelled/.test(rsvpError.message) ? (
        <Button label="Retry" variant="secondary" onPress={rsvpError.retry} />
      ) : null}

      <View style={{ gap: space.sm }}>
        <View style={styles.rowBetween}>
          <Text variant="bodyStrong" accessibilityRole="header">Responses</Text>
          <Text variant="small" muted>{d.rsvps.length} invited</Text>
        </View>
        <View style={styles.counts} accessibilityLabel={`${counts.going} going, ${counts.awaiting} awaiting reply, ${counts.cant_go} can't go, ${counts.needs_reconfirm} need to reconfirm`}>
          <Count n={counts.going} label="Going" />
          <Count n={counts.awaiting} label="Awaiting" />
          <Count n={counts.cant_go} label="Can't go" />
          <Count n={counts.needs_reconfirm} label="Reconfirm" />
        </View>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {d.rsvps.map((r, i) => (
            <View
              key={r.user_id}
              accessible
              accessibilityLabel={`${r.name}${r.user_id === userId ? ', you' : ''}${r.isGuest ? ', guest' : ''}, ${r.user_id === plan.organizer_id ? 'Going, organizer' : STATUS_LABEL[r.status]}`}
              style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
            >
              <Text style={{ flex: 1 }}>{r.name}{r.user_id === userId ? ' (you)' : ''}</Text>
              {r.isGuest ? <Tag label="guest" /> : null}
              <Tag label={r.user_id === plan.organizer_id ? 'Going, organizer' : STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
            </View>
          ))}
        </View>
      </View>

      {isOrganizer && !cancelled && !started ? <Button label="Edit plan" variant="secondary" onPress={() => { setSaved(null); setEditing(true); }} /> : null}
      {isOrganizer ? <EditPlanSheet
        key={`${plan.id}-${plan.current_revision}-${editing}`}
        d={d}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={async (r: EditResult) => {
          setSaved(!r.changed ? 'Nothing changed.' : r.material ? (r.needs_reconfirm > 0 ? `Saved. ${r.needs_reconfirm} invitee${r.needs_reconfirm === 1 ? '' : 's'} asked to reconfirm.` : 'Saved. Invitees will see what changed.') : 'Saved.');
          await refresh();
        }}
      /> : null}
      <Button label="Back to Plans" variant="ghost" onPress={() => router.navigate(href('/plans'))} />
    </View>
  );
}

function AnswerButtons({ pending, current, onAnswer, goingLabel, disabled }: {
  pending: 'going' | 'cant_go' | null; current: string; onAnswer: (s: 'going' | 'cant_go') => void; goingLabel: string; disabled: boolean;
}) {
  const c = useColors();
  const opts: { value: 'going' | 'cant_go'; label: string }[] = [{ value: 'going', label: goingLabel }, { value: 'cant_go', label: "Can't go" }];
  return (
    <View style={styles.answers} accessibilityRole="radiogroup" accessibilityLabel="Your response">
      {opts.map((o) => {
        const on = current === o.value;
        const busy = pending === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onAnswer(o.value)}
            disabled={disabled || !!pending}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: disabled || !!pending, busy }}
            accessibilityLabel={busy ? `${o.label}, saving` : on ? `${o.label}, your answer` : o.label}
            style={[styles.answer, { backgroundColor: on ? c.primary : c.card, borderColor: on ? c.primary : c.border, opacity: disabled ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color={on ? c.onPrimary : c.text} /> : <Text variant="bodyStrong" color={on ? c.onPrimary : c.text}>{on ? `✓ ${o.label}` : o.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  const c = useColors();
  return (
    <View accessible style={[styles.fact, { borderColor: c.border }]}>
      <Text variant="small" muted style={{ fontWeight: '600' }}>{label}</Text>
      <Text>{value}</Text>
      {note ? <Text variant="small" muted>{note}</Text> : null}
    </View>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  const c = useColors();
  return (
    <View style={[styles.count, { backgroundColor: c.surface }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="heading">{n}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  reconfirm: { borderWidth: 2, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  fact: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: space.sm, gap: 2 },
  answers: { flexDirection: 'row', gap: space.sm },
  answer: { flex: 1, minHeight: MIN_TAP + 4, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  counts: { flexDirection: 'row', gap: space.sm },
  count: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md },
  card: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.md },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
});
