// Figma (TEC-153 board A and B): the feedback sheet. Share with group is off by default and says what sharing does.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Button, Chip, Label, Sheet, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { feedbackFailed, feedbackKey, RATINGS, REASON_MAX, setFeedback, TAGS, validateFeedback, type Feedback, type FeedbackErrors, type Rating } from './feedback';

type Props = { planId: string; planName: string; userId: string; initial: Feedback | null; visible: boolean; onClose: () => void };

export function FeedbackSheet({ planId, planName, userId, initial, visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState<Rating | null>(initial?.rating ?? null);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [errors, setErrors] = useState<FeedbackErrors>({});

  async function save() {
    const found = validateFeedback(rating, reason);
    setErrors(found);
    if (found.rating || found.reason) return;
    await setFeedback(planId, { rating: rating!, tags, reason, shared });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: feedbackKey(planId, userId) }),
      queryClient.invalidateQueries({ queryKey: ['feedback-summary'] }),
    ]);
    onClose();
  }

  return <Sheet title={`How was ${planName}?`} visible={visible} onClose={onClose}>
    <View accessibilityRole="radiogroup" style={styles.chips}>
      {RATINGS.map(r => <Chip key={r.value} label={r.label} selected={rating === r.value} onPress={() => { setRating(r.value); setErrors(e => ({ ...e, rating: undefined })); }} />)}
    </View>
    {errors.rating && <Label accessibilityRole="alert" style={styles.caption}>{errors.rating}</Label>}
    <View style={styles.chips}>
      {TAGS.map(t => <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])} />)}
    </View>
    <TextField label="Anything to add? (optional)" value={reason} onChangeText={setReason} multiline placeholder="A short reason" error={errors.reason} />
    <Label style={[styles.caption, styles.right]}>{Array.from(reason).length} of {REASON_MAX}</Label>
    <View style={styles.shareRow}>
      <View style={styles.flex}>
        <Label style={type.bodyStrong}>Share with group</Label>
        <Label style={styles.caption}>{shared
          ? 'On: the group sees only a count, like “3 of 4 who shared would do again”. Your name and reason are never shown.'
          : 'Off: only you see this.'}</Label>
      </View>
      <Switch accessibilityLabel="Share with group" value={shared} onValueChange={setShared} trackColor={{ true: color.primary }} />
      <Label style={type.bodyStrong}>{shared ? 'On' : 'Off'}</Label>
    </View>
    <Button label="Save feedback" errorMessage={feedbackFailed} onPress={save} />
  </Sheet>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  caption: { ...type.caption, color: color.textSecondary },
  right: { textAlign: 'right' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
