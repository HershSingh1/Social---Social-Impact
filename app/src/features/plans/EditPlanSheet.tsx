import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Notice, OptionSheet, Text, TextField, WhenPicker, radius, space, useColors } from '@/shared/ui';
import { messageForError } from '@/shared/lib/errors';
import { chicagoWall, formatDay, formatTimeRange, minutesBetween, timeOptions, wallToHm } from '@/shared/lib/time';
import { editPlan, type EditResult, type PlanDetail } from './api';
import { defaultEnd, fieldsFromInstant, validateDraft, type PlanDraft } from './draft';
import { reconfirmCount } from './rsvp';

const TIMES = timeOptions();

/**
 * Organizer edit (P0-14). Changing the start, end or meeting point is MATERIAL: every Going invitee except the
 * organizer must reconfirm, and the organizer is told how many before saving. A note change is minor.
 */
export function EditPlanSheet({ d, visible, onClose, onSaved }: {
  d: PlanDetail; visible: boolean; onClose: () => void; onSaved: (r: EditResult) => void;
}) {
  const c = useColors();
  const cur = d.current;
  const startFields = fieldsFromInstant(cur.start_at);
  const endHm = wallToHm(chicagoWall(new Date(cur.end_at)));
  const duration = minutesBetween(new Date(cur.start_at), new Date(cur.end_at));

  const [date, setDate] = useState(startFields.date);
  const [start, setStart] = useState(startFields.start);
  const [end, setEnd] = useState(endHm);
  const [endTouched, setEndTouched] = useState(false);
  const [meeting, setMeeting] = useState(cur.meeting_point);
  const [note, setNote] = useState(cur.note ?? '');
  const [endSheet, setEndSheet] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const timeChanged = date !== startFields.date || start !== startFields.start || end !== endHm;
  const meetingChanged = meeting.trim() !== cur.meeting_point;
  const noteChanged = note.trim() !== (cur.note ?? '');
  const material = timeChanged || meetingChanged;
  const goingToReconfirm = reconfirmCount(d.rsvps, d.plan.organizer_id);

  const check = validateDraft(
    { key: '', clientKey: '', groupId: '', experienceId: '', pickId: null, date, start, end, endTouched, meetingPoint: meeting, note, recipients: [] } as PlanDraft,
    { timing_kind: 'flexible' },
  );
  // time fields are only checked when the time was changed, so a note or meeting-point edit still works on a plan that
  // already runs past midnight (the form picks an end time on the same day as the start)
  const errors = {
    start: timeChanged ? check.errors.start : undefined,
    end: timeChanged ? check.errors.end : undefined,
    meetingPoint: check.errors.meetingPoint,
    note: check.errors.note,
  };
  const invalid = !!(errors.start || errors.end || errors.meetingPoint || errors.note);

  async function save() {
    setFailure(null);
    if (invalid) return;
    const changes: Record<string, string> = {};
    if (timeChanged) {
      changes.start_local = `${date}T${start}:00`;
      changes.end_local = `${date}T${end}:00`;
    }
    if (meetingChanged) changes.meeting_point = meeting.trim();
    if (noteChanged) changes.note = note.trim();
    try {
      onSaved(await editPlan(d.plan.id, changes));
      onClose();
    } catch (e) {
      setFailure(messageForError(e));
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="title" accessibilityRole="header">Edit plan</Text>
          <Text muted>
            Now: {formatDay(cur.start_at)}, {formatTimeRange(cur.start_at, cur.end_at)} (Austin time)
          </Text>

          <WhenPicker
            label="Starts"
            valueIso={cur.start_at}
            days={60}
            error={errors.start}
            onChange={(iso) => {
              if (!iso) return;
              const f = fieldsFromInstant(iso);
              setDate(f.date);
              setStart(f.start);
              if (!endTouched) setEnd(defaultEnd(f.start, duration)); // keep the same length unless the end was set by hand
            }}
          />
          <View style={{ gap: space.xs }}>
            <Text variant="small" style={{ fontWeight: '600' }}>Ends</Text>
            <Button label={TIMES.find((t) => t.value === end)?.label ?? end} variant="secondary" onPress={() => setEndSheet(true)} />
            {errors.end ? <Text variant="small" color={c.danger} accessibilityRole="alert">Error: {errors.end}</Text> : null}
          </View>
          <TextField label="Meeting point" value={meeting} onChangeText={setMeeting} maxLength={220} error={errors.meetingPoint} />
          <TextField label="Note to the group (doesn't need reconfirmation)" value={note} onChangeText={setNote} multiline error={errors.note} hint={`${note.trim().length}/500`} />

          {material && goingToReconfirm > 0 ? (
            <Notice tone="error" title={`${goingToReconfirm} Going invitee${goingToReconfirm === 1 ? '' : 's'} will need to reconfirm.`}>
              They'll see the old and new details and answer again. Until then they show as Needs reconfirmation.
            </Notice>
          ) : material ? (
            <Notice>Invitees will see what changed.</Notice>
          ) : noteChanged ? (
            <Notice>A note change doesn't need anyone to reconfirm.</Notice>
          ) : null}
          {failure ? <Notice tone="error">{failure}</Notice> : null}

          <Button label="Save changes" onPress={save} disabled={invalid || (!material && !noteChanged)} />
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Keep as is" style={styles.keep}>
            <Text variant="bodyStrong" color={c.primary}>Keep as is</Text>
          </Pressable>
        </ScrollView>
        <OptionSheet
          visible={endSheet} title="Ends at" value={end} options={TIMES.map((t) => ({ id: t.value, label: t.label }))}
          onSelect={(v) => { setEnd(v); setEndTouched(true); }} onClose={() => setEndSheet(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingTop: space.xxl },
  keep: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
