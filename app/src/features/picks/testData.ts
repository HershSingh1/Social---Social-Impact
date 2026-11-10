import type { PickOptionRow, PickRow } from '@/types/database';
import type { PickDetail } from './api';

export const option = (id: string, name: string, position: number, extra: Partial<PickOptionRow['experiences']> = {}): PickOptionRow => ({
  id, position, proposed_start: null, experience_id: `e-${id}`,
  experiences: { id: `e-${id}`, name, category: 'outdoors', area: 'Zilker', price_kind: 'free', price_min: 0, price_max: 0, booking_required: false, timing_kind: 'flexible', meeting_point: 'Gate', ...extra },
});

export const SKETCH = option('sketch', 'Sketch and stroll', 1);
export const CLAY = option('clay', 'Clay and conversation', 2, { price_kind: 'exact', price_min: 38, price_max: 38, booking_required: true });
export const SWIM = option('swim', 'Barton Springs swim', 3, { price_kind: 'estimated', price_min: 5, price_max: 9 });

export const MEMBERS = ['maya', 'jordan', 'sam', 'priya', 'luis', 'tess'].map((id) => ({ user_id: id, name: id[0].toUpperCase() + id.slice(1), isGuest: id === 'jordan' || id === 'sam' }));

export function detail(over: Omit<Partial<PickDetail>, 'pick'> & { pick?: Partial<PickRow> } = {}): PickDetail {
  const { pick, ...rest } = over;
  return {
    pick: {
      id: 'p1', group_id: 'g1', organizer_id: 'maya', deadline: new Date(Date.now() + 5 * 3_600_000).toISOString(),
      starred_option_id: null, state: 'open', winner_option_id: null, tie_rule: null, override_option_id: null, ...pick,
    },
    groupName: 'Saturday crew',
    organizerName: 'Maya',
    options: [SKETCH, CLAY, SWIM],
    tallies: { sketch: { yes: 0, maybe: 0, no: 0 }, clay: { yes: 0, maybe: 0, no: 0 }, swim: { yes: 0, maybe: 0, no: 0 } },
    voters: [],
    myVotes: {},
    members: MEMBERS,
    planId: null,
    ...rest,
  };
}

// P0-09 worked example
export const WORKED_TALLIES = {
  sketch: { yes: 3, maybe: 2, no: 1 },
  clay: { yes: 4, maybe: 0, no: 2 },
  swim: { yes: 1, maybe: 3, no: 2 },
};
export const TIE_SENTENCE = 'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).';
