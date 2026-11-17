import { describe, expect, test } from '@jest/globals';
import {
  addDraftOption, deadlineFor, deadlineLabel, defaultCustomDeadline, defaultProposedStart, EMPTY_DRAFT, removeDraftOption,
  toggledVote, validateDraft, votePoints, withoutBadTimes,
  type DraftOption, type PickDraft,
} from '../model';

const first: DraftOption = { experienceId: 'one', name: 'Cap City Comedy' };
const second: DraftOption = { experienceId: 'two', name: 'Farmers market' };

describe('pick builder state', () => {
  test('collects unique options up to five and removes the starred option cleanly', () => {
    let draft = addDraftOption(EMPTY_DRAFT, first);
    draft = addDraftOption(draft, first);
    expect(draft.options).toHaveLength(1);
    draft = { ...addDraftOption(draft, second), starredExperienceId: first.experienceId };
    expect(removeDraftOption(draft, first.experienceId)).toMatchObject({ options: [second], starredExperienceId: undefined });
  });

  test('requires a group, 2–5 options and a deadline from 1 hour to 7 days', () => {
    const now = new Date('2026-11-11T18:00:00Z');
    const valid: PickDraft = { groupId: 'group', options: [first, second], deadlineHours: 24 };
    expect(validateDraft(valid, now)).toBeNull();
    expect(deadlineFor(valid, now)?.toISOString()).toBe('2026-11-12T18:00:00.000Z');
    expect(validateDraft({ ...valid, groupId: undefined }, now)).toBe('Choose a group.');
    expect(validateDraft({ ...valid, options: [first] }, now)).toBe('Add at least 2 options.');
    expect(validateDraft({ ...valid, options: [{ ...first, proposedStart: 'not a date' }, second] }, now))
      .toBe('Enter a valid proposed time for Cap City Comedy.');
    expect(validateDraft({ ...valid, deadlineHours: 'custom', customDeadline: '2026-11-20' }, now))
      .toBe('Deadline must be from 1 hour to 7 days away.');
  });
});

describe('deadline and time fields', () => {
  test('the deadline reads in Austin time whatever zone the phone is in', () => {
    const original = process.env.TZ;
    for (const zone of ['Asia/Tokyo', 'Europe/London', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      expect(deadlineLabel('2026-11-15T02:00:00Z')).toBe('Closes Sat, Nov 14 · 8:00 PM, Austin time (CST)');
      expect(deadlineLabel(new Date('2026-07-04T23:30:00Z'))).toBe('Closes Sat, Jul 4 · 6:30 PM, Austin time (CDT)');
    }
    process.env.TZ = original;
  });

  test('pickers open on sensible times', () => {
    const now = new Date('2026-11-11T18:02:00Z');
    expect(defaultCustomDeadline(now)).toBe('2026-11-12T18:05:00.000Z');
    expect(defaultProposedStart(now)).toBe('2026-11-13T01:00:00.000Z'); // 7 PM CST on Nov 12
  });

  test('typed times from an older draft are dropped, and a lost custom deadline falls back to 24 hours', () => {
    const old: PickDraft = { options: [{ ...first, proposedStart: '3pm sat' }, { ...second, proposedStart: '2026-11-15T21:00:00.000Z' }],
      deadlineHours: 'custom', customDeadline: 'tomorrow' };
    expect(withoutBadTimes(old)).toEqual({ options: [{ ...first, proposedStart: undefined }, old.options[1]],
      deadlineHours: 24, customDeadline: undefined });
    const kept: PickDraft = { ...old, customDeadline: '2026-11-16T03:00:00.000Z' };
    expect(withoutBadTimes(kept)).toMatchObject({ deadlineHours: 'custom', customDeadline: '2026-11-16T03:00:00.000Z' });
  });
});

describe('voting states', () => {
  test.each(['yes', 'maybe', 'no'] as const)('%s can be selected and tapped again to clear', value => {
    expect(toggledVote(undefined, value)).toBe(value);
    expect(toggledVote(value, value)).toBeNull();
  });

  test('switching a vote replaces it and points use Yes=2, Maybe=1, No=0', () => {
    expect(toggledVote('yes', 'maybe')).toBe('maybe');
    expect(votePoints({ yes: 3, maybe: 2 })).toBe(8);
  });
});
