// Figma (TEC-153 board C): the author's own feedback on the plan, and the group's counts. Shared counts only, never who.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Label } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { FeedbackSheet } from './FeedbackSheet';
import { deleteFeedback, feedbackKey, fetchMyFeedback, fetchSummary, ratingLabel, summaryKey, summaryLine } from './feedback';

/** "3 of 4 who shared would do again", or "No one has shared feedback yet". Quiet while loading or if it can't load. */
export function SummaryLine({ planId }: { planId: string }) {
  const summary = useQuery({ queryKey: summaryKey(planId), queryFn: () => fetchSummary(planId) });
  if (!summary.data) return null;
  return <Label style={summary.data.sharedCount ? type.bodyStrong : styles.caption}>{summaryLine(summary.data)}</Label>;
}

type Props = { planId: string; planName: string; userId: string; open: boolean; onOpen: (open: boolean) => void };

export function OutingFeedback({ planId, planName, userId, open, onOpen }: Props) {
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: feedbackKey(planId, userId), queryFn: () => fetchMyFeedback(planId) });
  if (mine.isPending) return null;
  const feedback = mine.data ?? null;
  return <Card>
    {feedback
      ? <>
        <Label style={styles.overline}>YOUR FEEDBACK ON {planName.toUpperCase()}</Label>
        <Label style={type.bodyStrong}>{ratingLabel(feedback.rating)} · {feedback.shared ? 'Shared with the group' : 'Private'}</Label>
        <View style={styles.row}>
          <Button label="Change" accessibilityLabel="Change your feedback" variant="secondary" size="small" onPress={() => onOpen(true)} />
          <Button label="Delete my feedback" variant="text" size="small" errorMessage="Couldn’t delete your feedback. Try again."
            onPress={async () => {
              await deleteFeedback(planId);
              await Promise.all([queryClient.invalidateQueries({ queryKey: feedbackKey(planId, userId) }), queryClient.invalidateQueries({ queryKey: ['feedback-summary'] })]);
            }} />
        </View>
      </>
      : <>
        <Label accessibilityRole="header" style={type.title2}>How was it?</Label>
        <Label style={styles.caption}>Only you see your feedback unless you choose to share it.</Label>
        <Button label="Rate this outing" variant="secondary" onPress={() => onOpen(true)} />
      </>}
    <Label style={styles.caption}>Only people who chose to share are counted. You never see who shared or why.</Label>
    {open && <FeedbackSheet key={`${feedback?.rating ?? 'new'}-${feedback?.shared ?? ''}`} planId={planId} planName={planName} userId={userId}
      initial={feedback} visible onClose={() => onOpen(false)} />}
  </Card>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
