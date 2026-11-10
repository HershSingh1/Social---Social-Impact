import type { PickExperience } from '@/types/database';
import { MAX_OPTIONS } from './ranking';

export type BuilderItem = { experience: PickExperience; proposedStart: string | null };
export type DeadlineChoice = { kind: 'hours'; hours: 6 | 12 | 24 | 48 } | { kind: 'custom'; iso: string };

export type BuilderState = {
  groupId: string | null;
  items: BuilderItem[];
  /** index into items of the tie-break star, or null */
  starred: number | null;
  deadline: DeadlineChoice;
};

export const INITIAL_BUILDER: BuilderState = { groupId: null, items: [], starred: null, deadline: { kind: 'hours', hours: 24 } };

export type BuilderAction =
  | { type: 'setGroup'; groupId: string }
  | { type: 'add'; item: BuilderItem }
  | { type: 'remove'; index: number }
  | { type: 'setTime'; index: number; iso: string | null }
  | { type: 'setStar'; index: number | null }
  | { type: 'setDeadline'; deadline: DeadlineChoice }
  | { type: 'reset' };

/** Changing group starts a fresh list: a pick belongs to exactly one group. */
export function builderReducer(s: BuilderState, a: BuilderAction): BuilderState {
  switch (a.type) {
    case 'setGroup':
      return s.groupId === a.groupId ? s : { ...INITIAL_BUILDER, groupId: a.groupId };
    case 'add':
      return s.items.length >= MAX_OPTIONS ? s : { ...s, items: [...s.items, a.item] };
    case 'remove': {
      const items = s.items.filter((_, i) => i !== a.index);
      const starred = s.starred === null ? null : s.starred === a.index ? null : s.starred > a.index ? s.starred - 1 : s.starred;
      return { ...s, items, starred };
    }
    case 'setTime':
      return { ...s, items: s.items.map((it, i) => (i === a.index ? { ...it, proposedStart: a.iso } : it)) };
    case 'setStar':
      return { ...s, starred: s.starred === a.index ? null : a.index };
    case 'setDeadline':
      return { ...s, deadline: a.deadline };
    case 'reset':
      return INITIAL_BUILDER;
  }
}

/** The deadline the server will check: 1 hour to 7 days from now. */
export function resolveDeadline(d: DeadlineChoice, now: Date = new Date()): Date {
  return d.kind === 'hours' ? new Date(now.getTime() + d.hours * 3_600_000) : new Date(d.iso);
}

/** null = fine; otherwise the message for under the field. */
export function deadlineError(d: DeadlineChoice, now: Date = new Date()): string | null {
  if (d.kind !== 'custom') return null;
  const ms = new Date(d.iso).getTime() - now.getTime();
  if (Number.isNaN(ms)) return 'Choose a date and time.';
  if (ms < 3_600_000) return 'Voting needs to stay open at least 1 hour.';
  if (ms > 7 * 86_400_000) return 'Voting can stay open at most 7 days.';
  return null;
}
