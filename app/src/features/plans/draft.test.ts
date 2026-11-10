import { buildSendArgs, defaultEnd, draftReducer, fieldsFromInstant, validateDraft, type PlanDraft } from './draft';

const NOW = new Date('2026-11-10T18:00:00Z'); // Tue Nov 10, 12:00 PM in Austin
const base: PlanDraft = {
  key: 'g1:e1', clientKey: 'k-1', groupId: 'g1', experienceId: 'e1', pickId: null,
  date: '2026-11-14', start: '14:00', end: '15:30', endTouched: false, meetingPoint: 'Benches at the W 3rd St trailhead',
  note: '', recipients: ['u1', 'u2'],
};
const flexible = { timing_kind: 'flexible' as const };

describe('validateDraft (P0-11: each problem has its own message)', () => {
  it('accepts a good draft and returns the instants', () => {
    const r = validateDraft(base, flexible, NOW);
    expect(r.ok).toBe(true);
    expect(r.startAt?.toISOString()).toBe('2026-11-14T20:00:00.000Z');
    expect(r.endAt?.toISOString()).toBe('2026-11-14T21:30:00.000Z');
  });
  it('refuses a start in the past', () => {
    expect(validateDraft({ ...base, date: '2026-11-09' }, flexible, NOW).errors.start).toBe('Start time must be in the future.');
  });
  it('refuses an end before (or equal to) the start', () => {
    expect(validateDraft({ ...base, end: '13:00' }, flexible, NOW).errors.end).toBe('End time must be after the start time.');
    expect(validateDraft({ ...base, end: '14:00' }, flexible, NOW).errors.end).toBe('End time must be after the start time.');
  });
  it('refuses a local time that does not exist (spring forward) instead of shifting it', () => {
    const r = validateDraft({ ...base, date: '2027-03-14', start: '02:30', end: '03:30' }, flexible, NOW);
    expect(r.errors.start).toMatch(/doesn't exist on that day/);
  });
  it('asks for a date and time before anything else', () => {
    const r = validateDraft({ ...base, date: null, start: null, end: null }, flexible, NOW);
    expect(r.errors.start).toBe('Choose a date and start time.');
    expect(r.errors.end).toBe('Choose an end time.');
    expect(r.ok).toBe(false);
  });
  it('checks meeting point (1-200) and note (500)', () => {
    expect(validateDraft({ ...base, meetingPoint: '   ' }, flexible, NOW).errors.meetingPoint).toMatch(/1 to 200/);
    expect(validateDraft({ ...base, meetingPoint: 'x'.repeat(201) }, flexible, NOW).errors.meetingPoint).toMatch(/1 to 200/);
    expect(validateDraft({ ...base, meetingPoint: 'x'.repeat(200) }, flexible, NOW).errors.meetingPoint).toBeUndefined();
    expect(validateDraft({ ...base, note: 'n'.repeat(501) }, flexible, NOW).errors.note).toBe('Keep the note to 500 characters.');
    expect(validateDraft({ ...base, note: 'n'.repeat(500) }, flexible, NOW).errors.note).toBeUndefined();
  });
  it('blocks fixed-session experiences for now, allows unknown hours', () => {
    expect(validateDraft(base, { timing_kind: 'fixed' }, NOW).errors.general).toMatch(/fixed sessions/);
    expect(validateDraft(base, { timing_kind: 'unknown' }, NOW).ok).toBe(true);
  });
});

describe('draft building', () => {
  it('sends wall-clock text, a trimmed meeting point and a null empty note', () => {
    expect(buildSendArgs({ ...base, meetingPoint: '  Trailhead  ', note: '   ' })).toEqual({
      clientKey: 'k-1', groupId: 'g1', experienceId: 'e1', startLocal: '2026-11-14T14:00:00', endLocal: '2026-11-14T15:30:00',
      meetingPoint: 'Trailhead', note: null, recipients: ['u1', 'u2'], pickId: null,
    });
  });
  it('derives fields from a proposed instant (Austin time)', () => {
    expect(fieldsFromInstant('2026-11-14T20:00:00Z')).toEqual({ date: '2026-11-14', start: '14:00' });
  });
  it('end defaults to start + duration rounded up to the half hour, clamped to 11:30 PM', () => {
    expect(defaultEnd('14:00', 90)).toBe('15:30');
    expect(defaultEnd('14:00', 100)).toBe('16:00');
    expect(defaultEnd('14:00', null)).toBe('15:00');
    expect(defaultEnd('22:30', 180)).toBe('23:30');
  });
});

describe('draftReducer', () => {
  it('moving the start keeps the duration while the end is untouched', () => {
    const d = draftReducer(base, { type: 'setStart', date: '2026-11-14', start: '16:00', durationMin: 90 });
    expect([d.start, d.end]).toEqual(['16:00', '17:30']);
  });
  it('after the end is set by hand, moving the start keeps that outing length', () => {
    let d = draftReducer(base, { type: 'setEnd', end: '16:00' }); // 2 hours
    d = draftReducer(d, { type: 'setStart', date: '2026-11-14', start: '15:00', durationMin: 90 });
    expect([d.start, d.end]).toEqual(['15:00', '17:00']);
  });
  it('toggles recipients', () => {
    let d = draftReducer(base, { type: 'toggleRecipient', userId: 'u1' });
    expect(d.recipients).toEqual(['u2']);
    d = draftReducer(d, { type: 'toggleRecipient', userId: 'u3' });
    expect(d.recipients).toEqual(['u2', 'u3']);
  });
});
