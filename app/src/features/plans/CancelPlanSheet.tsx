import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Label, Sheet, TextField } from '../../ui';
import { space, type } from '../../ui/theme';
import { CANCEL_REASONS, cancelledLine, cancelPlan, CancelRefused, reasonText, validateCancel, OTHER_MAX,
  type CancelErrors, type CancelReason } from './cancel';

type Props = { planId: string; organizerName: string; invited: number; visible: boolean; onClose: () => void; onCancelled: () => void };

// Cancel with a reason (P0-15): pick a reason, read what everyone will see, then confirm.
export function CancelPlanSheet({ planId, organizerName, invited, visible, onClose, onCancelled }: Props) {
  const [choice, setChoice] = useState<CancelReason | null>(null);
  const [other, setOther] = useState('');
  const [errors, setErrors] = useState<CancelErrors>({});
  const [confirming, setConfirming] = useState(false);

  function review() {
    const found = validateCancel(choice, other);
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  }
  async function confirm() {
    try {
      await cancelPlan(planId, reasonText(choice!, other));
      setConfirming(false);
      onCancelled();
    } catch (error) {
      if (!(error instanceof CancelRefused)) throw error;
      setConfirming(false);
      setErrors({ [error.field]: error.message });
    }
  }

  if (confirming) {
    const others = Math.max(invited - 1, 0);
    return <Sheet title="Cancel this plan?" visible={visible} onClose={() => setConfirming(false)}>
      <Label>Everyone invited will see: {cancelledLine(organizerName, reasonText(choice!, other))}</Label>
      <Label style={type.bodyStrong}>
        {others === 0 ? 'Nobody else is invited yet.' : `${others} ${others === 1 ? 'person' : 'people'} will be told. Answers and edits will close. This can’t be undone.`}
      </Label>
      <Button label="Cancel plan" onPress={confirm} errorMessage="Couldn’t cancel. Check your connection and try again." />
      <Button label="Keep plan" variant="secondary" onPress={() => setConfirming(false)} />
    </Sheet>;
  }

  return <Sheet title="Cancel plan" visible={visible} onClose={onClose}>
    {errors.form && <Label accessibilityRole="alert">{errors.form}</Label>}
    <Label accessibilityRole="header" style={type.bodyStrong}>Why are you cancelling?</Label>
    <View style={styles.chips}>
      {CANCEL_REASONS.map(reason => <Chip key={reason} label={reason} selected={choice === reason}
        onPress={() => { setChoice(reason); setErrors({}); }} />)}
    </View>
    {errors.reason && <Label accessibilityRole="alert" style={type.caption}>{errors.reason}</Label>}
    {choice === 'Other' && <TextField label="Reason" value={other} error={errors.other} maxLength={OTHER_MAX * 2}
      onChangeText={setOther} />}
    <Button label="Continue" onPress={review} />
  </Sheet>;
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
