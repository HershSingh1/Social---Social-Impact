export type VoteValue = 'yes' | 'maybe' | 'no';

export type DraftOption = {
  experienceId: string;
  name: string;
  detail?: string;
  proposedStart?: string;
};

export type PickDraft = {
  groupId?: string;
  options: DraftOption[];
  starredExperienceId?: string;
  deadlineHours: 6 | 12 | 24 | 48 | 'custom';
  customDeadline?: string;
};

export const EMPTY_DRAFT: PickDraft = { options: [], deadlineHours: 24 };

export function addDraftOption(draft: PickDraft, option: DraftOption): PickDraft {
  if (draft.options.some(item => item.experienceId === option.experienceId) || draft.options.length >= 5) return draft;
  return { ...draft, options: [...draft.options, option] };
}

export function removeDraftOption(draft: PickDraft, experienceId: string): PickDraft {
  const options = draft.options.filter(option => option.experienceId !== experienceId);
  return {
    ...draft,
    options,
    starredExperienceId: draft.starredExperienceId === experienceId ? undefined : draft.starredExperienceId,
  };
}

export function deadlineFor(draft: PickDraft, now = new Date()): Date | null {
  if (draft.deadlineHours === 'custom') {
    const value = new Date(draft.customDeadline ?? '');
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return new Date(now.getTime() + draft.deadlineHours * 60 * 60 * 1000);
}

export function validateDraft(draft: PickDraft, now = new Date()): string | null {
  if (!draft.groupId) return 'Choose a group.';
  if (draft.options.length < 2) return 'Add at least 2 options.';
  if (draft.options.length > 5) return 'A group pick can have at most 5 options.';
  const invalidTime = draft.options.find(option => option.proposedStart && Number.isNaN(new Date(option.proposedStart).getTime()));
  if (invalidTime) return `Enter a valid proposed time for ${invalidTime.name}.`;
  const deadline = deadlineFor(draft, now);
  if (!deadline) return 'Enter a valid deadline.';
  const hours = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hours < 1 || hours > 168) return 'Deadline must be from 1 hour to 7 days away.';
  return null;
}

export function toggledVote(current: VoteValue | undefined, pressed: VoteValue): VoteValue | null {
  return current === pressed ? null : pressed;
}

export function votePoints(tally: { yes: number; maybe: number }): number {
  return tally.yes * 2 + tally.maybe;
}
