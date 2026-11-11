import { describe, expect, test } from '@jest/globals';
import {
  addDraftOption, deadlineFor, EMPTY_DRAFT, removeDraftOption, toggledVote, validateDraft, votePoints,
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
