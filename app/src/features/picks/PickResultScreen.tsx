import { StyleSheet, View } from 'react-native';
import { Button, Card, Label, Tag } from '@/ui';
import { color, radius, space, type } from '@/ui/theme';
import type { PickDetail } from './api';
import { finalOrder, votePoints } from './model';
import { PickOrganizerActions } from './PickOrganizerActions';

type Props = {
  pick: PickDetail;
  viewerId: string;
  onPlanThis: (optionId: string) => void;
  onOpenPlan: (planId: string) => void;
  onChanged: () => void;
};

// Result of a closed, planned or cancelled pick (P0-09, P0-10): the winner, every option in final order with
// its counts, and the server's sentence for the rule that decided it. Figma Planning Flow 3.6 Group Vote.
export function PickResultScreen({ pick, viewerId, onPlanThis, onOpenPlan, onChanged }: Props) {
  const isOrganizer = pick.organizerId === viewerId;
  const organizer = pick.voters.find(v => v.id === pick.organizerId)?.name ?? 'The organizer';
  const ordered = finalOrder(pick.options, pick.starredOptionId, pick.winnerOptionId);
  const nobodyVoted = !pick.winnerOptionId;

  if (pick.state === 'cancelled') {
    return <Card><Label accessibilityRole="alert" style={type.headline}>{isOrganizer ? 'You' : organizer} cancelled this pick.</Label></Card>;
  }

  return <>
    <Card>
      <Label accessibilityRole="header" style={type.title2}>{nobodyVoted ? 'Nobody voted' : 'The group picked'}</Label>
      {pick.tieRule && <Label>{pick.tieRule}</Label>}
    </Card>

    {ordered.map((option, index) => {
      const winner = option.id === pick.winnerOptionId;
      return <View key={option.id} style={[styles.option, winner && styles.winner]} accessible
        accessibilityLabel={`${index + 1}. ${option.name}${winner ? ', winner' : ''}, ${votePoints(option.tally)} points, ${option.tally.yes} yes, ${option.tally.maybe} maybe, ${option.tally.no} no`}>
        <View style={styles.head}>
          <Label style={[type.headline, styles.grow]}>{index + 1}. {option.name}</Label>
          {winner && <Tag label="Winner" variant="dark" />}
        </View>
        <Label style={styles.caption}>{votePoints(option.tally)} points · {option.tally.yes} Yes · {option.tally.maybe} Maybe · {option.tally.no} No</Label>
        {/* Nobody voted: the organizer picks which option to plan. */}
        {nobodyVoted && isOrganizer && pick.state === 'closed' &&
          <Button label="Plan this" accessibilityLabel={`Plan ${option.name}`} size="small" onPress={async () => onPlanThis(option.id)} />}
      </View>;
    })}

    {pick.state === 'planned' && <Card>
      <Label style={type.headline}>Planned</Label>
      {pick.planId
        ? <Button label="Open the plan" variant="secondary" onPress={async () => onOpenPlan(pick.planId!)} />
        : <Label>A plan was made from this pick.</Label>}
    </Card>}

    {pick.state === 'closed' && !nobodyVoted && (isOrganizer
      ? <Button label="Plan this" accessibilityLabel={`Plan ${ordered[0]?.name ?? 'the winner'}`}
        onPress={async () => onPlanThis(pick.winnerOptionId!)} />
      : <Label accessibilityRole="alert" style={type.bodyStrong}>{organizer} will send a plan.</Label>)}
    {pick.state === 'closed' && nobodyVoted && !isOrganizer &&
      <Label accessibilityRole="alert" style={type.bodyStrong}>{organizer} will choose an option and send a plan.</Label>}

    {isOrganizer && pick.state === 'closed' && <PickOrganizerActions pickId={pick.id} allowClose={false} onDone={onChanged} />}
  </>;
}

const styles = StyleSheet.create({
  option: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, backgroundColor: color.bg },
  winner: { borderWidth: 2, borderColor: color.primary, backgroundColor: color.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  caption: { ...type.caption, color: color.textSecondary },
});
