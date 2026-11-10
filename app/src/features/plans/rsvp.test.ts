import type { RsvpStatus } from '@/types/database';
import { countRsvps, countsSummary, reconfirmCount } from './rsvp';

const rows = (...s: RsvpStatus[]) => s.map((status, i) => ({ user_id: i === 0 ? 'maya' : `u${i}`, status }));
const tuple = (r: { status: RsvpStatus }[]) => { const c = countRsvps(r); return [c.going, c.awaiting, c.cant_go, c.needs_reconfirm]; };

describe('RSVP counts (P0-13 worked example)', () => {
  it('reconciles through the whole sequence 1/5/0/0 -> 3/3/0/0 -> 3/2/1/0 -> 1/2/1/2 -> 2/2/1/1 -> 2/2/2/0', () => {
    const sent = rows('going', 'awaiting', 'awaiting', 'awaiting', 'awaiting', 'awaiting');
    expect(tuple(sent)).toEqual([1, 5, 0, 0]);
    const answered = rows('going', 'going', 'going', 'awaiting', 'awaiting', 'awaiting');
    expect(tuple(answered)).toEqual([3, 3, 0, 0]);
    const declined = rows('going', 'going', 'going', 'cant_go', 'awaiting', 'awaiting');
    expect(tuple(declined)).toEqual([3, 2, 1, 0]);
    expect(reconfirmCount(declined, 'maya')).toBe(2); // the organizer is not asked
    const edited = rows('going', 'needs_reconfirm', 'needs_reconfirm', 'cant_go', 'awaiting', 'awaiting');
    expect(tuple(edited)).toEqual([1, 2, 1, 2]);
    const oneBack = rows('going', 'going', 'needs_reconfirm', 'cant_go', 'awaiting', 'awaiting');
    expect(tuple(oneBack)).toEqual([2, 2, 1, 1]);
    const final = rows('going', 'going', 'cant_go', 'cant_go', 'awaiting', 'awaiting');
    expect(tuple(final)).toEqual([2, 2, 2, 0]);
    for (const r of [sent, answered, declined, edited, oneBack, final]) {
      expect(tuple(r).reduce((a, b) => a + b, 0)).toBe(r.length); // always adds up to the invitees
    }
  });
  it('summarises in words', () => {
    expect(countsSummary({ going: 2, awaiting: 0, cant_go: 1, needs_reconfirm: 0 })).toBe("2 Going, 0 Awaiting, 1 Can't go, 0 to reconfirm");
  });
});
