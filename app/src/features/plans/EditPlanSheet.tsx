import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Label, Sheet, TextField } from '../../ui';
import { space, type } from '../../ui/theme';
import { changesFrom, EditRefused, formFrom, saveEdit, validateEdit, type EditField, type EditForm } from './edit';
import type { Plan } from './plan';
import { TimeField } from './TimeField';

type Props = { plan: Plan; visible: boolean; onClose: () => void; onSaved: () => void };

/** Going invitees other than the organizer: the people a material edit flips to Needs reconfirmation. */
const goingOthers = (plan: Plan) => plan.invitees.filter(i => i.status === 'going' && !i.isOrganizer).length;

// Organizer edit (P0-14). A material change shows what changed and who must reconfirm before it's saved.
export function EditPlanSheet({ plan, visible, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditForm>(formFrom(plan.current));
  const [errors, setErrors] = useState<Partial<Record<EditField, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const { changes, material } = changesFrom(plan.current, form);

  function moveStart(start: Date) {
    // Moving the start keeps the plan's length.
    const length = new Date(form.end).getTime() - new Date(form.start).getTime();
    setForm({ ...form, start: start.toISOString(), end: new Date(start.getTime() + length).toISOString() });
  }
  function review() {
    const found = validateEdit(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || changes.length === 0) return;
    if (material) setConfirming(true);
    else void save();
  }
  async function save() {
    try {
      await saveEdit(plan.id, plan.current, form);
      setConfirming(false);
      onSaved();
    } catch (error) {
      if (!(error instanceof EditRefused)) throw error;
      setConfirming(false);
      setErrors({ [error.field]: error.message });
    }
  }

  if (confirming) {
    const n = goingOthers(plan);
    return <Sheet title="Save these changes?" visible={visible} onClose={() => setConfirming(false)}>
      <Label>Changing: {changes.map(c => c.label).join(', ')}.</Label>
      <Label style={type.bodyStrong}>
        {n === 0 ? 'Nobody needs to reconfirm.' : `${n} Going ${n === 1 ? 'invitee' : 'invitees'} will need to reconfirm.`}
      </Label>
      <Button label="Save changes" onPress={save} errorMessage="Couldn’t save. Check your connection and try again." />
      <Button label="Keep editing" variant="secondary" onPress={() => setConfirming(false)} />
    </Sheet>;
  }

  return <Sheet title="Edit plan" visible={visible} onClose={onClose}>
    {errors.form && <Label accessibilityRole="alert">{errors.form}</Label>}
    <TimeField label="Starts" value={form.start} error={errors.start} onChange={moveStart} />
    <TimeField label="Ends" value={form.end} error={errors.end} onChange={d => setForm({ ...form, end: d.toISOString() })} />
    <TextField label="Meeting point" value={form.meetingPoint} error={errors.meetingPoint} onChangeText={v => setForm({ ...form, meetingPoint: v })} />
    <TextField label="Note (optional)" value={form.note} error={errors.note} onChangeText={v => setForm({ ...form, note: v })} multiline />
    <View style={styles.actions}>
      <Button label="Save" onPress={review} disabled={changes.length === 0}
        errorMessage="Couldn’t save. Check your connection and try again." />
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({ actions: { gap: space.sm } });
