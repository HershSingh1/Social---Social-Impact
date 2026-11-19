// Figma 4145:25677, boards A to C: the prompts on a plan that has ended. Two hours after the end the organizer is
// asked "Did it happen?" and each person who said Going is asked "Did you go?". Going never counts as attending.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Label } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { OutingFeedback, SummaryLine } from '../feedback/OutingFeedback';
import { answersKey, attendedSaid, fetchMyAnswers, OUTING_CHOICES, outingSaid, promptOpen, reportAttendance, reportOuting,
  saveFailed, type Attended, type OutingStatus } from './outings';

type Props = { planId: string; planName: string; userId: string; endAt: string; now: number;
  isOrganizer: boolean; isGoing: boolean };

export function OutingPrompts({ planId, planName, userId, endAt, now, isOrganizer, isGoing }: Props) {
  const queryClient = useQueryClient();
  const open = promptOpen(endAt, now);
  const answers = useQuery({ queryKey: answersKey(planId, userId), queryFn: () => fetchMyAnswers(planId, userId, isOrganizer), enabled: open });
  const [changing, setChanging] = useState<'outing' | 'attended' | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [rating, setRating] = useState(false);
  if (!open || !answers.data) return null;

  const { outing, attended } = answers.data;
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: answersKey(planId, userId) }),
    queryClient.invalidateQueries({ queryKey: ['group-history'] }),
  ]);
  async function saveOuting(status: OutingStatus) { await reportOuting(planId, status); setChanging(null); await refresh(); }
  async function saveAttended(value: Attended) {
    await reportAttendance(planId, value);
    setChanging(null);
    await refresh();
    // Saying Yes opens the feedback sheet (P2-03). It is private unless they share it.
    if (value === 'yes') setRating(true);
  }

  return <>
    {isOrganizer && (outing === null
      ? <Card>
        <Label accessibilityRole="header" style={type.title2}>Did {planName} happen?</Label>
        <Label style={styles.caption}>Your answer shows on the group page. You can change it later.</Label>
        {OUTING_CHOICES.map(c => <Button key={c.status} label={c.label} variant={c.status === 'happened' ? 'primary' : c.status === 'didnt_happen' ? 'secondary' : 'text'}
          errorMessage={saveFailed} onPress={() => saveOuting(c.status)} />)}
      </Card>
      : <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Label style={styles.overline}>ORGANIZER’S ANSWER</Label>
            <Label style={type.bodyStrong}>✓ {outingSaid[outing]}</Label>
          </View>
          <Button label="Change" accessibilityLabel="Change your answer about whether it happened" variant="secondary" size="small"
            onPress={() => setChanging(changing === 'outing' ? null : 'outing')} />
        </View>
        {changing === 'outing' && <>
          <Label style={type.bodyStrong}>Change your answer</Label>
          <ChoiceChips choices={OUTING_CHOICES.map(c => ({ value: c.status, label: c.label }))} selected={outing} onChoose={saveOuting} />
          <Label style={styles.caption}>If it didn’t happen, it leaves the group’s outing count.</Label>
        </>}
      </Card>)}

    {isGoing && !skipped && (attended === null
      ? <Card>
        <Label accessibilityRole="header" style={type.title2}>Did you go?</Label>
        <Label style={styles.caption}>Only counts for you. Saying Going earlier didn’t count as going.</Label>
        <View style={styles.row}>
          <View style={styles.flex}><Button label="Yes" errorMessage={saveFailed} onPress={() => saveAttended('yes')} /></View>
          <View style={styles.flex}><Button label="No" variant="secondary" errorMessage={saveFailed} onPress={() => saveAttended('no')} /></View>
          <View style={styles.flex}><Button label="Skip" variant="text" accessibilityLabel="Skip, don’t answer" onPress={() => setSkipped(true)} /></View>
        </View>
      </Card>
      : <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Label style={styles.overline}>YOUR ATTENDANCE</Label>
            <Label style={type.bodyStrong}>✓ {attendedSaid[attended]}</Label>
          </View>
          <Button label="Change" accessibilityLabel="Change your attendance answer" variant="secondary" size="small"
            onPress={() => setChanging(changing === 'attended' ? null : 'attended')} />
        </View>
        {changing === 'attended' && <ChoiceChips choices={[{ value: 'yes', label: 'Yes, I went' }, { value: 'no', label: 'No, I didn’t go' }]}
          selected={attended} onChoose={saveAttended} />}
      </Card>)}

    {attended === 'yes' && <OutingFeedback planId={planId} planName={planName} userId={userId} open={rating} onOpen={setRating} />}
    <SummaryLine planId={planId} />
  </>;
}

/** Chips that save on tap. They lock while a save is running, so one tap sends one request. */
function ChoiceChips<T extends string>({ choices, selected, onChoose }: {
  choices: { value: T; label: string }[]; selected: T; onChoose: (value: T) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  async function choose(value: T) {
    if (saving || value === selected) return;
    setSaving(true); setFailed(null);
    try { await onChoose(value); } catch (error) { setFailed(saveFailed(error)); } finally { setSaving(false); }
  }
  return <>
    <View style={styles.chips}>
      {choices.map(c => <Chip key={c.value} label={c.label} selected={c.value === selected} disabled={saving} onPress={() => { void choose(c.value); }} />)}
    </View>
    {failed && <Label accessibilityRole="alert" style={styles.caption}>{failed}</Label>}
  </>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
