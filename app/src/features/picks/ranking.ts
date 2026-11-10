import type { PickOptionRow, PickRow, Tally, VoteValue } from '@/types/database';

export const EMPTY_TALLY: Tally = { yes: 0, maybe: 0, no: 0 };

/** Yes = 2, Maybe = 1, No or no vote = 0 (spec P0-09). */
export const points = (t: Tally) => t.yes * 2 + t.maybe;

export type RankedOption = { option: PickOptionRow; tally: Tally; points: number };

/**
 * Final order, identical on every phone: points desc, fewer No votes, the starred option, then the option added
 * first. The server decides the winner when it closes; this only orders the list for display.
 */
export function rankOptions(options: PickOptionRow[], tallies: Record<string, Tally>, starredId: string | null): RankedOption[] {
  return options
    .map((option) => {
      const tally = tallies[option.id] ?? EMPTY_TALLY;
      return { option, tally, points: points(tally) };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.tally.no - b.tally.no ||
        Number(b.option.id === starredId) - Number(a.option.id === starredId) ||
        a.option.position - b.option.position,
    );
}

/** The option the group is going with: the organizer's choice if there is one, otherwise the vote winner. */
export const chosenOptionId = (p: Pick<PickRow, 'override_option_id' | 'winner_option_id'>) =>
  p.override_option_id ?? p.winner_option_id;

export type VoterProgress = { voted: number; total: number; hasVoted: Record<string, boolean> };

/** "5 of 6 voted": a member counts once they have voted on every option. Only current members are counted. */
export function voterProgress(memberIds: string[], voters: { user_id: string; complete: boolean }[]): VoterProgress {
  const complete = new Set(voters.filter((v) => v.complete).map((v) => v.user_id));
  const hasVoted: Record<string, boolean> = {};
  for (const id of memberIds) hasVoted[id] = complete.has(id);
  return { voted: memberIds.filter((id) => hasVoted[id]).length, total: memberIds.length, hasVoted };
}

/**
 * Options added after the viewer voted: they have voted on some options but not these, and these come after the
 * last option they voted on. Shown as "New option" (spec P0-08).
 */
export function newOptionIds(options: PickOptionRow[], myVotes: Record<string, VoteValue>): Set<string> {
  const voted = options.filter((o) => myVotes[o.id]);
  if (voted.length === 0) return new Set();
  const lastVoted = Math.max(...voted.map((o) => o.position));
  return new Set(options.filter((o) => !myVotes[o.id] && o.position > lastVoted).map((o) => o.id));
}

export const MAX_OPTIONS = 5;
export const MIN_OPTIONS = 2;
