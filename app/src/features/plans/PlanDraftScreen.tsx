import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ErrorState, Label, Loading, Screen, Tag, TextField } from '../../ui';
import { color, minTap, radius, space, type } from '../../ui/theme';
import { logEvent } from '../../lib/analytics';
import { formatClock, formatWhen, zoneLabel } from '../../lib/time';
import { bookingText } from './plan';
import { TimeField } from './TimeField';
import {
  acknowledgeLabel, discardDraft, fetchPlanContext, loadDraft, newDraft, saveDraft, sendPlan, SendRefused, validateDraft,
  type DraftErrors, type DraftSource, type PlanContext, type PlanDraft,
} from './draft';

type Props = { source: DraftSource; organizerId: string; proposedStart?: string; onSent: (planId: string) => void };

const DEFAULT_DURATION_MIN = 120;
const tomorrowAtTen = () => { const d = new Date(Date.now() + 86_400_000); d.setUTCHours(16, 0, 0, 0); return d; }; // 10 AM CST

function Review({ draft, context }: { draft: PlanDraft; context: PlanContext }) {
  const who = context.members.filter(m => draft.recipients.includes(m.userId)).map(m => m.name);
  const rows: [string, string][] = [
    ['What', context.experience.name],
    ['When', `${formatWhen(draft.start)} to ${formatClock(draft.end)}, ${zoneLabel(new Date(draft.start))}`],
    ['Where', draft.meetingPoint.trim()],
    ['Who', who.length ? `You, ${who.join(', ')}` : 'You. No other invitees yet.'],
    ['Cost', context.experience.priceLabel],
    ['Booking', bookingText(context.experience.bookingRequired)],
  ];
  return <Card>
    {rows.map(([label, value]) => <View key={label} style={styles.reviewRow} accessible>
      <Label style={styles.fieldLabel}>{label}</Label><Label>{value}</Label>
    </View>)}
    {draft.note.trim() ? <View style={styles.reviewRow} accessible><Label style={styles.fieldLabel}>Note</Label><Label>{draft.note.trim()}</Label></View> : null}
  </Card>;
}

// No Figma frame for this checkbox: a UI-kit style row with a 24 pt box inside a 44 pt tap target.
function Acknowledge({ label, checked, error, onToggle }: { label: string; checked: boolean; error?: string; onToggle: () => void }) {
  return <View style={styles.field}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }}
      accessibilityHint={error ? `Error: ${error}` : undefined} onPress={onToggle} style={styles.checkRow}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Label style={[type.subhead, { color: color.onPrimary }]}>✓</Label>}
      </View>
      <Label style={styles.flex}>{label}</Label>
    </Pressable>
    {error && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Label>}
  </View>;
}

// Plan draft and review (P0-11) and Send (P0-12). Figma has no draft frame for P0, so this uses the UI kit.
export function PlanDraftScreen({ source, organizerId, proposedStart, onSent }: Props) {
  const context = useQuery({ queryKey: ['plan-context', source.groupId, source.experienceId], queryFn: () => fetchPlanContext(source.groupId, source.experienceId, organizerId) });
  const [draft, setDraft] = useState<PlanDraft>();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [failed, setFailed] = useState(false);

  // Reopen the saved draft (same client_key) or start one with every member ticked.
  useEffect(() => {
    if (!context.data || draft) return;
    const ctx = context.data;
    void loadDraft(source).then(saved => {
      if (!saved) logEvent('plan_drafted', { group_id: source.groupId, experience_id: source.experienceId, pick_id: source.pickId });
      setDraft(saved ?? newDraft(source, {
        start: proposedStart && new Date(proposedStart).getTime() > Date.now() ? new Date(proposedStart) : tomorrowAtTen(),
        durationMin: ctx.experience.durationMin ?? DEFAULT_DURATION_MIN,
        meetingPoint: ctx.experience.meetingPoint ?? '', recipients: ctx.members.map(m => m.userId),
      }));
    });
  }, [context.data, draft, proposedStart, source]);

  if (context.isPending || (context.data && !draft)) return <Screen><Loading label="Opening your plan…" /></Screen>;
  if (!context.data || !draft) return <Screen><ErrorState message="Couldn’t load this activity and group." onRetry={() => { void context.refetch(); }} /></Screen>;
  const ctx = context.data;

  function update(change: Partial<PlanDraft>) {
    const next = { ...draft!, ...change };
    setDraft(next);
    void saveDraft(next);
  }
  function moveStart(start: Date) {
    // Moving the start keeps the length of the plan.
    const length = new Date(draft!.end).getTime() - new Date(draft!.start).getTime();
    update({ start: start.toISOString(), end: new Date(start.getTime() + Math.max(length, 15 * 60_000)).toISOString() });
  }
  function toReview() {
    const found = validateDraft(draft!);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep('review');
  }
  async function send() {
    try {
      const planId = await sendPlan(draft!);
      await discardDraft(source);
      onSent(planId);
    } catch (error) {
      if (error instanceof SendRefused) {
        setErrors({ [error.field]: error.message });
        // The listing lost its price or booking since this screen loaded: reload it and ask on Review.
        if (error.field === 'acknowledged') { update({ acknowledged: false }); void context.refetch(); return; }
        setStep('edit');
        return;
      }
      setFailed(true);
      throw error; // the button shows the message; the draft and its key stay for Retry
    }
  }

  const needsAck = ctx.experience.unconfirmed.length > 0 || errors.acknowledged !== undefined;
  const acked = draft.acknowledged === true;
  if (step === 'review') {
    return <Screen>
      <Label accessibilityRole="header" style={type.title1}>Review your plan</Label>
      <Review draft={draft} context={ctx} />
      {needsAck && <Acknowledge label={acknowledgeLabel(ctx.experience.unconfirmed.length ? ctx.experience.unconfirmed : ['price', 'booking'])}
        checked={acked} error={errors.acknowledged}
        onToggle={() => { setErrors(e => ({ ...e, acknowledged: undefined })); update({ acknowledged: !acked }); }} />}
      {needsAck && !acked && <Label style={styles.caption}>Tick the box above to send.</Label>}
      <Button label={failed ? 'Retry' : 'Send invitation'} onPress={send} disabled={needsAck && !acked}
        errorMessage="Couldn’t send. Your draft is saved on this phone. Check your connection and retry." />
      <Button label="Edit" variant="secondary" onPress={() => setStep('edit')} />
    </Screen>;
  }

  const fixed = ctx.experience.timingKind === 'fixed';
  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>{ctx.experience.name}</Label>
    <Label style={styles.caption}>Saved on this phone</Label>
    {errors.form && <Label accessibilityRole="alert">{errors.form}</Label>}
    <TimeField label="Starts" value={draft.start} error={errors.start} onChange={moveStart} />
    <TimeField label="Ends" value={draft.end} error={errors.end} onChange={d => update({ end: d.toISOString() })} />
    {fixed ? <View style={styles.field}>
      <Label style={styles.fieldLabel}>Listed sessions</Label>
      {ctx.experience.sessions.length
        ? <View style={styles.chips}>{ctx.experience.sessions.map(s => <Tag key={s} label={s} />)}</View>
        : <Label style={styles.caption}>{ctx.experience.hoursText ?? 'Session times being checked'}</Label>}
      <Label style={styles.caption}>Pick any time for your plan.</Label>
    </View>
      : <Label style={styles.caption}>{ctx.experience.hoursText ? `Listed hours: ${ctx.experience.hoursText}` : 'Hours unverified'}</Label>}
    <TextField label="Meeting point" value={draft.meetingPoint} error={errors.meetingPoint} onChangeText={v => update({ meetingPoint: v })} />
    <TextField label="Note (optional)" value={draft.note} error={errors.note} onChangeText={v => update({ note: v })} multiline />
    <View style={styles.field}>
      <Label style={styles.fieldLabel}>Who’s invited</Label>
      <Label>You (organizer)</Label>
      <View style={styles.chips}>
        {ctx.members.map(m => <Chip key={m.userId} label={m.name} selected={draft.recipients.includes(m.userId)}
          onPress={() => update({ recipients: draft.recipients.includes(m.userId)
            ? draft.recipients.filter(id => id !== m.userId) : [...draft.recipients, m.userId] })} />)}
      </View>
      {draft.recipients.length === 0 && <Label style={styles.caption}>No other invitees yet</Label>}
      {errors.recipients && <Label accessibilityRole="alert">{errors.recipients}</Label>}
    </View>
    <Button label="Review" onPress={toReview} />
  </Screen>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  field: { gap: space.xs },
  fieldLabel: { ...type.subhead, color: color.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  reviewRow: { gap: space.xxs },
  flex: { flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  box: { width: space.xl, height: space.xl, borderRadius: radius.xs, borderWidth: 2, borderColor: color.primary,
    alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: color.primary },
});
