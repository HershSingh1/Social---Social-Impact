import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button, EmptyState, Notice, OptionSheet, Screen, SkeletonList, Tag, Text, TextField, WhenPicker, MIN_TAP, radius, space, useColors,
} from '@/shared/ui';
import { href, signInHref } from '@/shared/lib/nav';
import { messageForError } from '@/shared/lib/errors';
import { chicagoWallToDate, formatDay, formatTimeRange, parseYmdHm, timeOptions } from '@/shared/lib/time';
import { useAuth } from '@/features/auth/AuthProvider';
import { useGroup, useMembers } from '@/features/groups/hooks';
import { useExperience } from '@/features/discovery/hooks';
import { BookingNotice } from '@/features/discovery/BookingNotice';
import { priceLabel } from '@/features/discovery/format';
import { usePickDetail } from '@/features/picks/hooks';
import { chosenOptionId } from '@/features/picks/ranking';
import type { Experience } from '@/types/database';
import { sendPlan } from './api';
import { buildSendArgs, defaultEnd, fieldsFromInstant, validateDraft, type PlanDraft } from './draft';
import { usePlanDraft } from './PlanDraftStore';

const TIMES = timeOptions();

/**
 * Entry point. A plan starts from a closed group pick ("Plan this": the winner's experience and proposed time, every
 * member invited) or from an experience ("Start a plan"). Either way the person reviews everything before sending.
 */
export function PlanDraftScreen({ pickId, experienceId, groupId }: { pickId?: string; experienceId?: string; groupId?: string }) {
  const router = useRouter();
  const { isAccount } = useAuth();

  if (!isAccount) {
    const back = pickId ? `/plan/new?pickId=${pickId}` : `/plan/new?experienceId=${experienceId}&groupId=${groupId}`;
    return (
      <Screen edges={[]}>
        <EmptyState title="Sign in to plan this" body="Planning and sending invitations needs an account." actionLabel="Sign in" onAction={() => router.push(signInHref(back))} />
      </Screen>
    );
  }
  if (pickId) return <FromPick pickId={pickId} />;
  if (experienceId && groupId) return <DraftForm groupId={groupId} experienceId={experienceId} pickId={null} proposedStart={null} />;
  return (
    <Screen edges={[]}>
      <EmptyState title="Nothing to plan yet" body="Choose an experience, or close a group pick, to start a draft." actionLabel="Browse experiences" onAction={() => router.replace(href('/'))} />
    </Screen>
  );
}

function FromPick({ pickId }: { pickId: string }) {
  const router = useRouter();
  const { userId } = useAuth();
  const q = usePickDetail(pickId);
  const d = q.data;

  if (d === undefined) {
    return <Screen edges={[]}>{q.isError ? <EmptyState title="Couldn't load the pick" actionLabel="Try again" onAction={() => q.refetch()} /> : <SkeletonList rows={4} />}</Screen>;
  }
  const chosen = d ? d.options.find((o) => o.id === chosenOptionId(d.pick)) : null;
  if (!d || d.pick.state !== 'closed' || d.pick.organizer_id !== userId || !chosen) {
    return (
      <Screen edges={[]}>
        <EmptyState
          title="This pick can't be planned right now"
          body="Only the organizer can plan a pick, after voting has closed and an option has been chosen."
          actionLabel="Back to the pick"
          onAction={() => router.replace(href(`/pick/${pickId}`))}
        />
      </Screen>
    );
  }
  return <DraftForm groupId={d.pick.group_id} experienceId={chosen.experience_id} pickId={pickId} proposedStart={chosen.proposed_start} />;
}

function DraftForm({ groupId, experienceId, pickId, proposedStart }: { groupId: string; experienceId: string; pickId: string | null; proposedStart: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const c = useColors();
  const { userId } = useAuth();
  const experience = useExperience(experienceId);
  const members = useMembers(groupId);
  const group = useGroup(groupId);
  const store = usePlanDraft();
  const { draft, loaded, begin, dispatch, clear } = store;

  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [endSheet, setEndSheet] = useState(false);
  const [sentOk, setSentOk] = useState(false); // once sent, never create a new draft for this plan

  const key = pickId ?? `${groupId}:${experienceId}`;
  const exp = experience.data && experience.data.status === 'active' ? experience.data : null;
  const others = useMemo(() => (members.data ?? []).filter((m) => m.user_id !== userId), [members.data, userId]);

  // create (or resume) the draft once everything it is prefilled from has loaded
  useEffect(() => {
    if (sentOk || !loaded || !exp || !members.data || draft?.key === key) return;
    const prefill = proposedStart && new Date(proposedStart).getTime() > Date.now() ? fieldsFromInstant(proposedStart) : null;
    begin({
      key, groupId, experienceId, pickId,
      date: prefill?.date ?? null, start: prefill?.start ?? null,
      end: prefill ? defaultEnd(prefill.start, exp.duration_min) : null,
      endTouched: false,
      meetingPoint: exp.meeting_point, note: '',
      recipients: others.map((m) => m.user_id),
    });
  }, [sentOk, loaded, exp, members.data, draft?.key, key, begin, groupId, experienceId, pickId, proposedStart, others]);

  if (experience.data === undefined || members.data === undefined || !loaded) {
    if (experience.isError || members.isError) {
      return <Screen edges={[]}><EmptyState title="Couldn't load your draft." actionLabel="Try again" onAction={() => { experience.refetch(); members.refetch(); }} /></Screen>;
    }
    return <Screen edges={[]}><SkeletonList rows={5} rowHeight={80} /></Screen>;
  }
  if (!exp) {
    return <Screen edges={[]}><EmptyState title="This listing was removed" body="Pick another experience to plan." actionLabel="Back to map" onAction={() => router.replace(href('/'))} /></Screen>;
  }
  if (!draft || draft.key !== key) return <Screen edges={[]}><SkeletonList rows={5} rowHeight={80} /></Screen>;

  return (
    <Form
      draft={draft} exp={exp} groupName={group.data?.name ?? 'Your group'} members={others}
      attempted={attempted} sending={sending} failure={failure} endSheet={endSheet} setEndSheet={setEndSheet}
      onStart={(iso) => { const f = fieldsFromInstant(iso); dispatch({ type: 'setStart', date: f.date, start: f.start, durationMin: exp.duration_min }); }}
      dispatch={dispatch}
      onSend={async () => {
        setFailure(null);
        const check = validateDraft(draft, exp);
        if (!check.ok) { setAttempted(true); return; }
        setSending(true);
        try {
          const planId = await sendPlan(buildSendArgs(draft));
          setSentOk(true);
          clear(); // the plan exists on the server: the draft has done its job
          await Promise.all([qc.invalidateQueries({ queryKey: ['plans'] }), qc.invalidateQueries({ queryKey: ['pick'] })]);
          router.replace(href(`/plan/${planId}?sent=1`));
        } catch (e) {
          // the draft (and its request id) is kept, so Retry can never create a second plan
          setFailure(messageForError(e));
        } finally {
          setSending(false);
        }
      }}
      c={c}
    />
  );
}

function Form({ draft, exp, groupName, members, attempted, sending, failure, endSheet, setEndSheet, onStart, dispatch, onSend, c }: {
  draft: PlanDraft; exp: Experience; groupName: string; members: { user_id: string; profiles: { display_name: string; is_guest: boolean } | null }[];
  attempted: boolean; sending: boolean; failure: string | null; endSheet: boolean; setEndSheet: (v: boolean) => void;
  onStart: (iso: string) => void; dispatch: ReturnType<typeof usePlanDraft>['dispatch']; onSend: () => Promise<void>; c: ReturnType<typeof useColors>;
}) {
  const check = validateDraft(draft, exp);
  const hide = (msg?: string) => (msg && !attempted && /^Choose /.test(msg) ? undefined : msg); // don't scold an untouched form
  const startIso = draft.date && draft.start ? chicagoWallToDate(parseYmdHm(draft.date, draft.start))?.toISOString() ?? null : null;
  const invited = members.filter((m) => draft.recipients.includes(m.user_id));
  const endLabel = TIMES.find((t) => t.value === draft.end)?.label ?? 'Choose an end time';
  const whenText = check.startAt && check.endAt
    ? `${formatDay(check.startAt)}, ${formatTimeRange(check.startAt.toISOString(), check.endAt.toISOString())} (Austin time, America/Chicago)`
    : 'Choose a date and time';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        <View style={{ gap: space.xs }}>
          <Tag label={draft.pickId ? 'Winner of the group pick' : 'Draft'} tone={draft.pickId ? 'success' : 'neutral'} />
          <Text variant="title" accessibilityRole="header">{exp.name}</Text>
          <Text muted>Saved on this phone as you go. Nobody sees it until you send it.</Text>
        </View>

        {failure ? (
          <Notice tone="error" title="Invitation not sent.">
            {`${failure} Your draft is saved, and Retry won't send it twice.`}
          </Notice>
        ) : null}
        {check.errors.general ? <Notice tone="error">{check.errors.general}</Notice> : null}
        {exp.timing_kind === 'unknown' ? <Notice title="Hours unverified">We don't know this experience's hours. You can still plan it; check the source first.</Notice> : null}

        <View pointerEvents={sending ? 'none' : 'auto'} style={{ gap: space.lg, opacity: sending ? 0.6 : 1 }}>
          <Section title="Group"><Tag label={`${groupName}, ${members.length + 1} joined`} tone="info" /></Section>

          <Section title="Who gets the invitation" aside={`${invited.length} of ${members.length}`}>
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, paddingVertical: space.xs }]}>
              <View style={styles.person} accessible accessibilityLabel="You, the organizer, always going">
                <Text style={{ flex: 1 }}>You</Text><Tag label="Going, organizer" tone="success" />
              </View>
              {members.map((m) => {
                const on = draft.recipients.includes(m.user_id);
                const name = m.profiles?.display_name ?? 'Someone';
                return (
                  <Pressable
                    key={m.user_id}
                    onPress={() => dispatch({ type: 'toggleRecipient', userId: m.user_id })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Invite ${name}${m.profiles?.is_guest ? ', guest' : ''}`}
                    style={[styles.person, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}
                  >
                    <Text variant="bodyStrong" style={{ width: 28 }}>{on ? '✓' : '○'}</Text>
                    <Text style={{ flex: 1 }}>{name}</Text>
                    {m.profiles?.is_guest ? <Tag label="guest" /> : null}
                  </Pressable>
                );
              })}
            </View>
            {invited.length === 0 ? <Text variant="small" muted>No other invitees yet</Text> : null}
          </Section>

          <Section title="When" aside="Austin time">
            <WhenPicker label="Starts" valueIso={startIso} days={60} error={hide(check.errors.start)} onChange={(iso) => iso && onStart(iso)} />
            <View style={{ gap: space.xs }}>
              <Text variant="small" style={{ fontWeight: '600' }}>Ends</Text>
              <Button label={endLabel} variant="secondary" onPress={() => setEndSheet(true)} accessibilityHint="Choose the end time" />
              {hide(check.errors.end) ? <Text variant="small" color={c.danger} accessibilityRole="alert">Error: {check.errors.end}</Text> : null}
            </View>
            {exp.timing_kind === 'flexible' && exp.hours_text ? <Text variant="small" muted>Open hours: {exp.hours_text}</Text> : null}
          </Section>

          <TextField
            label="Meeting point"
            value={draft.meetingPoint}
            onChangeText={(t) => dispatch({ type: 'patch', patch: { meetingPoint: t } })}
            maxLength={220}
            error={check.errors.meetingPoint}
            hint={exp.area}
          />
          <TextField
            label="Note (optional)"
            value={draft.note}
            onChangeText={(t) => dispatch({ type: 'patch', patch: { note: t } })}
            multiline
            error={check.errors.note}
            hint={`${draft.note.trim().length}/500`}
          />

          <Section title="Price and booking">
            <Text variant="bodyStrong">{priceLabel(exp)}</Text>
            <BookingNotice required={exp.booking_required} url={exp.booking_url} />
          </Section>

          <Section title="Review" aside="What invitees will see">
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]} accessibilityLabel="Plan summary">
              <Row k="What" v={exp.name} />
              <Row k="When" v={whenText} />
              <Row k="Where" v={draft.meetingPoint.trim() || 'Add a meeting point'} />
              <Row k="Who" v={`${groupName}: You${invited.length ? `, ${invited.map((m) => m.profiles?.display_name ?? 'Someone').join(', ')}` : ''}`} />
              <Row k="Cost" v={priceLabel(exp)} />
              <Row k="Booking" v={exp.booking_required ? 'Required. Going here does not reserve a spot.' : 'Not needed'} />
            </View>
          </Section>
        </View>

        <Button
          label={sending ? 'Sending invitation…' : failure ? 'Retry' : invited.length ? `Send invitation to ${invited.length}` : 'Send invitation'}
          onPress={onSend}
          loading={sending}
        />
        <OptionSheet
          visible={endSheet}
          title="Ends at"
          value={draft.end ?? ''}
          options={TIMES.map((t) => ({ id: t.value, label: t.label }))}
          onSelect={(v) => dispatch({ type: 'setEnd', end: v })}
          onClose={() => setEndSheet(false)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.rowBetween}>
        <Text variant="bodyStrong" accessibilityRole="header">{title}</Text>
        {aside ? <Text variant="small" muted>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.summaryRow} accessible accessibilityLabel={`${k}: ${v}`}>
      <Text variant="small" muted style={{ width: 64, fontWeight: '600' }}>{k}</Text>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TAP + 4, paddingHorizontal: space.sm },
  summaryRow: { flexDirection: 'row', gap: space.sm, paddingVertical: 2 },
});
