import type { PickOptionRow, Tally, VoteValue } from '@/types/database';
import { chosenOptionId, newOptionIds, points, rankOptions, voterProgress } from './ranking';

const opt = (id: string, position: number): PickOptionRow => ({
  id, position, proposed_start: null, experience_id: `e-${id}`,
  experiences: { id: `e-${id}`, name: id, category: 'outdoors', area: 'Zilker', price_kind: 'free', price_min: 0, price_max: 0, booking_required: false, timing_kind: 'flexible', meeting_point: 'Gate' },
});
const sketch = opt('sketch', 1), clay = opt('clay', 2), swim = opt('swim', 3);

// the worked example from P0-09
const tallies: Record<string, Tally> = {
  sketch: { yes: 3, maybe: 2, no: 1 }, // 8 points
  clay: { yes: 4, maybe: 0, no: 2 },   // 8 points
  swim: { yes: 1, maybe: 3, no: 2 },   // 5 points
};

describe('ranking (P0-09 worked example)', () => {
  it('scores Yes 2, Maybe 1, No 0', () => {
    expect(points(tallies.sketch)).toBe(8);
    expect(points(tallies.clay)).toBe(8);
    expect(points(tallies.swim)).toBe(5);
  });
  it('Sketch and stroll beats Clay and conversation on fewer No votes; Barton Springs swim is third', () => {
    const order = rankOptions([clay, swim, sketch], tallies, null).map((r) => r.option.id);
    expect(order).toEqual(['sketch', 'clay', 'swim']);
  });
  it('a tie on points and No votes goes to the starred option, then the option added first', () => {
    const t: Record<string, Tally> = { sketch: { yes: 1, maybe: 0, no: 0 }, clay: { yes: 1, maybe: 0, no: 0 } };
    expect(rankOptions([sketch, clay], t, 'clay').map((r) => r.option.id)).toEqual(['clay', 'sketch']);
    expect(rankOptions([sketch, clay], t, null).map((r) => r.option.id)).toEqual(['sketch', 'clay']);
  });
  it('options with no tally row rank as zero', () => {
    expect(rankOptions([sketch, clay], { clay: { yes: 1, maybe: 0, no: 0 } }, null)[0].option.id).toBe('clay');
  });
  it('the organizer\'s choice wins over the vote winner', () => {
    expect(chosenOptionId({ override_option_id: 'clay', winner_option_id: 'sketch' })).toBe('clay');
    expect(chosenOptionId({ override_option_id: null, winner_option_id: 'sketch' })).toBe('sketch');
    expect(chosenOptionId({ override_option_id: null, winner_option_id: null })).toBeNull();
  });
});

describe('who has voted', () => {
  it('counts only current members who voted on every option', () => {
    const p = voterProgress(['a', 'b', 'c'], [{ user_id: 'a', complete: true }, { user_id: 'b', complete: false }, { user_id: 'gone', complete: true }]);
    expect(p).toEqual({ voted: 1, total: 3, hasVoted: { a: true, b: false, c: false } });
  });
});

describe('new options', () => {
  const mine = (v: Record<string, VoteValue>) => v;
  it('flags options added after the viewer voted', () => {
    expect([...newOptionIds([sketch, clay, swim], mine({ sketch: 'yes', clay: 'no' }))]).toEqual(['swim']);
  });
  it('flags nothing before the viewer has voted on anything, or when everything is voted', () => {
    expect(newOptionIds([sketch, clay], {}).size).toBe(0);
    expect(newOptionIds([sketch, clay], mine({ sketch: 'yes', clay: 'yes' })).size).toBe(0);
  });
});
