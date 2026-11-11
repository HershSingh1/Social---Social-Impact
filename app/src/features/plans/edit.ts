import { supabase } from '../../lib/supabase';
import { toChicagoLocal } from '../../lib/time';
import { MEETING_POINT_MAX, NOTE_MAX } from './limits';
import type { Revision } from './plan';

export type EditForm = { start: string; end: string; meetingPoint: string; note: string };
export type EditField = keyof EditForm | 'form';
export type Change = { field: 'start' | 'end' | 'meetingPoint' | 'note'; label: string };

export const formFrom = (rev: Revision): EditForm =>
  ({ start: rev.startAt, end: rev.endAt, meetingPoint: rev.meetingPoint, note: rev.note ?? '' });

/** What differs from the current revision. Start, end and meeting point are material (P0-14); the note is not. */
export function changesFrom(rev: Revision, form: EditForm): { changes: Change[]; material: boolean } {
  const changes: Change[] = [];
  if (toChicagoLocal(new Date(form.start)) !== toChicagoLocal(new Date(rev.startAt))) changes.push({ field: 'start', label: 'Start time' });
  if (toChicagoLocal(new Date(form.end)) !== toChicagoLocal(new Date(rev.endAt))) changes.push({ field: 'end', label: 'End time' });
  if (form.meetingPoint.trim() !== rev.meetingPoint) changes.push({ field: 'meetingPoint', label: 'Meeting point' });
  if ((form.note.trim() || null) !== (rev.note || null)) changes.push({ field: 'note', label: 'Note' });
  return { changes, material: changes.some(c => c.field !== 'note') };
}

export function validateEdit(form: EditForm, now = Date.now()): Partial<Record<EditField, string>> {
  const errors: Partial<Record<EditField, string>> = {};
  if (new Date(form.start).getTime() <= now) errors.start = 'Pick a start time in the future.';
  if (new Date(form.end).getTime() <= new Date(form.start).getTime()) errors.end = 'The end has to be after the start.';
  const point = form.meetingPoint.trim();
  if (!point) errors.meetingPoint = 'Enter where to meet.';
  else if (Array.from(point).length > MEETING_POINT_MAX) errors.meetingPoint = `Use ${MEETING_POINT_MAX} characters or fewer.`;
  if (Array.from(form.note.trim()).length > NOTE_MAX) errors.note = `Use ${NOTE_MAX} characters or fewer.`;
  return errors;
}

const SERVER_ERRORS: Record<string, [EditField, string]> = {
  invalid_times: ['start', 'Pick a start time in the future, and an end after it.'],
  nonexistent_local_time: ['start', 'That time doesn’t exist on this date (clocks skip ahead). Pick another time.'],
  plan_started: ['form', 'This plan has started, so it can’t be edited.'],
  plan_cancelled: ['form', 'This plan was cancelled.'],
  invalid_changes: ['form', 'Couldn’t save these changes. Check each field and try again.'],
};
export class EditRefused extends Error {
  constructor(public readonly field: EditField, message: string) { super(message); }
}

/** Sends only the fields that changed, in Austin wall-clock time. Returns how many people now need to reconfirm. */
export async function saveEdit(planId: string, rev: Revision, form: EditForm): Promise<number> {
  const { changes } = changesFrom(rev, form);
  const payload: Record<string, string | null> = {};
  for (const { field } of changes) {
    if (field === 'start') payload.start_local = toChicagoLocal(new Date(form.start));
    if (field === 'end') payload.end_local = toChicagoLocal(new Date(form.end));
    if (field === 'meetingPoint') payload.meeting_point = form.meetingPoint.trim();
    if (field === 'note') payload.note = form.note.trim() || null;
  }
  const { data, error } = await supabase.rpc('edit_plan', { plan_id: planId, changes: payload });
  if (error) {
    const known = Object.keys(SERVER_ERRORS).find(code => error.message.includes(code));
    if (known) throw new EditRefused(...SERVER_ERRORS[known]);
    throw error;
  }
  return (data as { needs_reconfirm: number }).needs_reconfirm;
}
