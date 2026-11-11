import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Empty, ErrorState, Label, Loading, Screen, Tag } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { formatClock, formatWhen, zoneLabel } from '../../lib/time';
import { countRsvps, planKey, PlanUnavailable, priceText, respond, RespondRefused, statusLabel, type Plan } from './plan';
import { EditPlanSheet } from './EditPlanSheet';
import { ReconfirmBanner } from './ReconfirmBanner';
import { usePlan } from './usePlan';

type Props = { planId: string; viewerId: string; justSent?: boolean };

const saveFailed = (error: unknown) => error instanceof RespondRefused ? error.message
  : 'Couldn’t save your answer. Your previous answer still stands. Tap again to retry.';

function Details({ plan }: { plan: Plan }) {
  const rev = plan.current;
  return <Card>
    <View accessible style={styles.detail}>
      <Label style={type.bodyStrong}>{formatWhen(rev.startAt)} to {formatClock(rev.endAt)}</Label>
      <Label style={styles.caption}>{zoneLabel(new Date(rev.startAt))}</Label>
    </View>
    <View accessible style={styles.detail}>
      <Label style={type.bodyStrong}>Meet at {rev.meetingPoint}</Label>
    </View>
    <View accessible style={styles.detail}>
      <Label style={type.bodyStrong}>{priceText(rev.price)}</Label>
      <Label style={styles.caption}>{rev.bookingRequired ? 'Booking required. Each person books their own spot.' : 'No booking needed.'}</Label>
    </View>
    {rev.note ? <Label>{rev.note}</Label> : null}
  </Card>;
}

// Plan screen with RSVP (P0-13), from Figma 3.7 Plan Details & RSVP (28:4321). No Maybe on a plan (spec).
export function PlanScreen({ planId, viewerId, justSent }: Props) {
  const query = usePlan(planId);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const retry = () => { void query.refetch(); };

  if (query.isPending) return <Screen><Loading label="Loading the plan…" /></Screen>;
  if (query.error instanceof PlanUnavailable) {
    return <Screen><Empty title="This plan isn’t available to you" description="Only people invited to a plan can see it." /></Screen>;
  }
  if (!query.data) return <Screen><ErrorState message="Couldn’t load this plan." onRetry={retry} /></Screen>;

  const plan = query.data;
  const me = plan.invitees.find(i => i.userId === viewerId);
  const counts = countRsvps(plan.invitees);
  // Judged at the last read (at most 30 s old); the server locks answers at the start time either way.
  const started = new Date(plan.current.startAt).getTime() <= query.dataUpdatedAt;
  const isOrganizer = plan.organizerId === viewerId;

  async function answer(status: 'going' | 'cant_go') {
    try { await respond(plan.id, plan.current.revision, status); }
    finally { await queryClient.invalidateQueries({ queryKey: planKey(plan.id) }); }
  }

  return <Screen>
    {justSent && <Label accessibilityRole="alert" style={styles.banner}>Invitations sent</Label>}
    {query.isError && <ErrorState message="Couldn’t refresh this plan. Showing what we loaded last." onRetry={retry} />}
    <Label accessibilityRole="header" style={type.title1}>{plan.name}</Label>
    {plan.state === 'cancelled' && <Tag label={`Cancelled${plan.cancelReason ? `: ${plan.cancelReason}` : ''}`} variant="dark" />}
    <Details plan={plan} />

    {plan.state === 'sent' && me?.status === 'needs_reconfirm' && !started && (() => {
      const was = plan.revisions.find(r => r.revision === me.answeredRevision);
      return was ? <ReconfirmBanner was={was} now={plan.current} onAnswer={answer} errorMessage={saveFailed} /> : null;
    })()}
    {plan.state === 'sent' && isOrganizer && !started && <>
      <Button label="Edit plan" variant="secondary" onPress={() => setEditing(true)} />
      {editing && <EditPlanSheet plan={plan} visible onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); void queryClient.invalidateQueries({ queryKey: planKey(plan.id) }); }} />}
    </>}

    {plan.state === 'sent' && me && <View style={styles.section}>
      <Label accessibilityRole="header" style={styles.overline}>ARE YOU GOING?</Label>
      <Label>Your answer: {statusLabel[me.status]}</Label>
      {started ? <Label>This plan has started, so answers are closed.</Label>
        : isOrganizer ? <Label style={styles.caption}>You’re organizing, so you’re going.</Label>
        : <View style={styles.answers}>
          <View style={styles.flex}><Button label="Going" variant={me.status === 'going' ? 'primary' : 'secondary'}
            accessibilityLabel={me.status === 'going' ? 'Going, your answer' : 'Going'} errorMessage={saveFailed} onPress={() => answer('going')} /></View>
          <View style={styles.flex}><Button label="Can’t go" variant={me.status === 'cant_go' ? 'primary' : 'secondary'}
            accessibilityLabel={me.status === 'cant_go' ? 'Can’t go, your answer' : 'Can’t go'} errorMessage={saveFailed} onPress={() => answer('cant_go')} /></View>
        </View>}
    </View>}

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Who’s coming</Label>
      <Label accessibilityLabel={`${counts.going} going, ${counts.awaiting} awaiting reply, ${counts.cant_go} can’t go, ${counts.needs_reconfirm} need to reconfirm`}>
        {counts.going} going · {counts.awaiting} awaiting reply · {counts.cant_go} can’t go · {counts.needs_reconfirm} need to reconfirm
      </Label>
      {plan.invitees.map(i => <View key={i.userId} style={styles.person} accessible accessibilityLabel={`${i.name}${i.isOrganizer ? ', organizer' : ''}: ${statusLabel[i.status]}`}>
        <Avatar name={i.name} size="sm" />
        <Label style={styles.flex}>{i.name}{i.isOrganizer ? ' (organizer)' : ''}</Label>
        <Label style={styles.caption}>{statusLabel[i.status]}</Label>
      </View>)}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  banner: { ...type.bodyStrong, color: color.text, backgroundColor: color.greenSoft, padding: space.md },
  detail: { gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  section: { gap: space.sm },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flexGrow: 1, flexShrink: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
});
