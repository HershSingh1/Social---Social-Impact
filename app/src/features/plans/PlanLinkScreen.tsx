import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { formatClock, formatWhen, zoneLabel } from '../../lib/time';
import { INVITE_ERRORS, InviteRefused, joinPlan, previewLink } from './invites';
import { priceText } from './plan';

type Props = { token: string; onBack: () => void; onJoined: (planId: string) => void };

// A plan link (P0-13): sign in first (D1, the gate keeps the link), see what the plan is, then tap Join plan.
// Joining adds you to this one plan, never to the group.
export function PlanLinkScreen({ token, onBack, onJoined }: Props) {
  const query = useQuery({ queryKey: ['plan-link', token], queryFn: () => previewLink(token),
    retry: (count, error) => !(error instanceof InviteRefused) && count < 1 });

  if (query.isPending) return <Screen><Loading label="Opening the invite…" /></Screen>;
  if (query.error instanceof InviteRefused) {
    return <Screen>
      <Empty title="This invite can’t be opened" description={query.error.message} />
      <Button label="Back" variant="secondary" onPress={onBack} />
    </Screen>;
  }
  if (!query.data) {
    return <Screen><ErrorState message="Couldn’t open this invite. Check your connection and try again." onRetry={() => { void query.refetch(); }} /></Screen>;
  }
  const plan = query.data;
  return <Screen>
    <Button label="Back" variant="text" size="small" onPress={onBack} />
    <View style={styles.heading}>
      <Label accessibilityRole="header" style={type.title1}>{plan.activity}</Label>
      <Label style={styles.secondary}>{plan.inviter} invited you to a plan with {plan.group}.</Label>
    </View>
    <Card>
      <View accessible style={styles.detail}>
        <Label style={type.bodyStrong}>{formatWhen(plan.startAt)} to {formatClock(plan.endAt)}</Label>
        <Label style={styles.caption}>{zoneLabel(new Date(plan.startAt))}</Label>
      </View>
      <View accessible style={styles.detail}>
        <Label style={type.bodyStrong}>{priceText(plan.price)}</Label>
        <Label style={styles.caption}>{plan.bookingRequired ? 'Booking required. Each person books their own spot.' : 'No booking needed.'}</Label>
      </View>
    </Card>
    <Label style={styles.caption}>Joining adds you to this plan only, not to the group.</Label>
    {plan.alreadyJoined && <Label style={styles.caption}>You’re already in this plan.</Label>}
    <View style={styles.footer}>
      <Button label={plan.alreadyJoined ? 'Open plan' : 'Join plan'}
        errorMessage={error => error instanceof InviteRefused ? INVITE_ERRORS[error.code] : 'Couldn’t join. Check your connection and try again.'}
        onPress={async () => { onJoined(await joinPlan(token)); }} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: space.sm },
  secondary: { color: color.textSecondary },
  detail: { gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
  footer: { marginTop: 'auto' },
});
