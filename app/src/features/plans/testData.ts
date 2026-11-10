import type { MemberRow } from '@/types/database';
import { chicagoWallToDate, dayOptions, parseYmdHm } from '@/shared/lib/time';
import type { PlanDetail } from './api';

export const member = (id: string, name: string, guest = false, role: 'owner' | 'member' = 'member'): MemberRow => ({
  user_id: id, role, joined_at: '2026-11-01T00:00:00Z', profiles: { display_name: name, is_guest: guest, avatar_path: null },
});
export const MEMBERS = [
  member('maya', 'Maya', false, 'owner'), member('jordan', 'Jordan', true), member('sam', 'Sam', true),
  member('priya', 'Priya'), member('luis', 'Luis'), member('tess', 'Tess'),
];

/** 2:00 PM Austin time, three days from now: the same wall-clock time whatever time of day the tests run. */
export const IN_3_DAYS = () => chicagoWallToDate(parseYmdHm(dayOptions(new Date(), 4)[3].value, '14:00')) as Date;

export function planDetail(over: Omit<Partial<PlanDetail>, 'plan'> & { plan?: Partial<PlanDetail['plan']> } = {}): PlanDetail {
  const start = IN_3_DAYS();
  const { plan, ...rest } = over;
  return {
    plan: { id: 'plan1', group_id: 'g1', organizer_id: 'maya', experience_id: 'sketch', pick_id: null, state: 'sent', current_revision: 1, cancel_reason: null, ...plan },
    groupName: 'Saturday crew',
    organizerName: 'Maya',
    experience: {
      id: 'sketch', name: 'Sketch and stroll', category: 'art_walks', area: 'Shoal Creek', price_kind: 'free', price_min: 0, price_max: 0,
      booking_required: false, timing_kind: 'flexible', meeting_point: 'Benches', booking_url: null, duration_min: 90,
    },
    current: {
      revision: 1, start_at: start.toISOString(), end_at: new Date(start.getTime() + 90 * 60_000).toISOString(), time_zone: 'America/Chicago',
      meeting_point: 'Benches at the W 3rd St trailhead', note: null,
      price_snapshot: { price_kind: 'free', price_min: 0, price_max: 0 }, booking_required: false,
    },
    previous: null,
    rsvps: [
      { user_id: 'maya', name: 'Maya', isGuest: false, status: 'going', revision: 1 },
      { user_id: 'jordan', name: 'Jordan', isGuest: true, status: 'awaiting', revision: 1 },
      { user_id: 'sam', name: 'Sam', isGuest: true, status: 'awaiting', revision: 1 },
    ],
    ...rest,
  };
}
