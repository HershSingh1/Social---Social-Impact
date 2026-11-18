// Figma: 4046:3700 PRO-15 Review queue and Review a suggestion
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth';
import { Button, Card, Chip, Empty, ErrorState, Label, Loading, Screen, Tag, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { canReview, loadReviewQueue, reviewerCapabilityKey, reviewSuggestion, type Submission } from './suggestions';

const checks = ['In Austin', 'Location and timing are usable', 'Price label is honest', 'Source link works', 'Not a duplicate'];

export default function ReviewQueueScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return <ReviewQueue key={userId} userId={userId} />;
}

function ReviewQueue({ userId }: { userId: string | undefined }) {
  const queueKey = ['listing-review-queue', userId] as const;
  const capability = useQuery({ queryKey: reviewerCapabilityKey(userId), queryFn: canReview, enabled: !!userId });
  const queue = useQuery({ queryKey: queueKey, queryFn: loadReviewQueue, enabled: !!userId && capability.data === true });
  const client = useQueryClient(); const [selected, setSelected] = useState<Submission>();
  const [checked, setChecked] = useState<string[]>([]); const [reason, setReason] = useState('');
  async function decide(decision: 'approve' | 'needs_changes' | 'reject') {
    if (decision === 'approve' && checked.length < checks.length) throw new Error('checks_required');
    if (decision !== 'approve' && !reason.trim()) throw new Error('reason_required');
    await reviewSuggestion(selected!.id, decision, reason); await client.invalidateQueries({ queryKey: queueKey }); setSelected(undefined); setChecked([]); setReason('');
  }
  if (userId && capability.isPending) return <Screen><Loading label="Checking reviewer access…" /></Screen>;
  if (capability.isError) return <Screen><ErrorState message="Couldn’t check reviewer access." onRetry={async () => { await capability.refetch(); }} /></Screen>;
  if (!capability.data) return <Screen><Empty title="Review queue isn’t available" description="Only team reviewers can open this screen." /><Button label="Go back" variant="secondary" onPress={() => router.back()} /></Screen>;
  if (queue.isPending) return <Screen><Loading label="Loading review queue…" /></Screen>;
  if (!queue.data) return <Screen><ErrorState message="Couldn’t load the review queue." onRetry={async () => { await queue.refetch(); }} /></Screen>;
  if (selected) { const p = selected.payload; return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Review</Label><Label style={styles.caption}>1 of {queue.data.submissions.length} waiting</Label>
    <Card><Label style={type.title2}>{String(p.name ?? 'Untitled suggestion')}</Label><Label>{String(p.description ?? '')}</Label>
      <Label>{String(p.address ?? p.meeting_point ?? '')}</Label><Label>{String(p.timing_kind ?? '')} · {String(p.duration_min ?? '')} minutes</Label>
      <Label>{String(p.source ?? '')}</Label></Card>
    <View style={styles.checks}>{checks.map(item => <Chip key={item} label={item} selected={checked.includes(item)}
      onPress={() => setChecked(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} />)}</View>
    <TextField label="Reason (sent if you send it back or don’t approve)" value={reason} onChangeText={setReason} multiline />
    <Button label="Approve" disabled={checked.length < checks.length} onPress={() => decide('approve')} />
    <View style={styles.row}><View style={styles.flex}><Button label="Send back" variant="secondary" onPress={() => decide('needs_changes')}
      errorMessage="Add a reason before sending this back." /></View><View style={styles.flex}><Button label="Don’t approve" variant="secondary" onPress={() => decide('reject')}
        errorMessage="Add a reason before deciding not to approve." /></View></View>
    <Button label="Back to queue" variant="text" onPress={() => setSelected(undefined)} />
  </Screen>; }
  return <Screen><Label accessibilityRole="header" style={type.title1}>Review queue</Label>
    {queue.isError && <ErrorState message="Couldn’t refresh the queue. Showing what we loaded." onRetry={async () => { await queue.refetch(); }} />}
    {!queue.data.submissions.length ? <Empty title="Nothing waiting" description="New suggestions will appear here." /> : queue.data.submissions.map(item =>
      <Card key={item.id}><View style={styles.row}><View style={styles.flex}><Label style={type.bodyStrong}>{String(item.payload.name ?? 'Untitled')}</Label>
        <Label style={styles.caption}>Waiting for review</Label></View><Button label="Review" accessibilityLabel={`Review ${String(item.payload.name ?? 'suggestion')}`}
          variant="text" size="small" onPress={() => setSelected(item)} /></View></Card>)}
    <Card><View style={styles.row}><Label style={[type.bodyStrong, styles.flex]}>Outdated-info reports</Label><Tag label={String(queue.data.reports.length)} variant="dark" /></View>
      {!queue.data.reports.length ? <Label style={styles.caption}>No reports waiting.</Label> : queue.data.reports.map((report, index) =>
        <View key={`${report.experienceId}-${index}`}><Label style={type.bodyStrong}>{report.name}</Label><Label>{report.issue}</Label></View>)}</Card>
  </Screen>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary }, checks: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }, flex: { flexGrow: 1, flexBasis: 140 },
});
