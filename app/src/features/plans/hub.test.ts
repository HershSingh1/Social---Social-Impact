import { buildHub, nextItemForGroup, type HubPick, type HubPlan } from './hub';

const NOW = new Date('2026-11-10T18:00:00Z');
const iso = (days: number, hour = 20) => new Date(NOW.getTime() + days * 86_400_000 + (hour - 18) * 3_600_000).toISOString();
const plan = (id: string, over: Partial<HubPlan> = {}): HubPlan => ({
  id, groupId: 'g1', groupName: 'Saturday crew', experienceName: `Plan ${id}`, startAt: iso(3), endAt: iso(3, 22),
  state: 'sent', status: 'going', isOrganizer: false, ...over,
});
const pick = (id: string, over: Partial<HubPick> = {}): HubPick => ({
  id, groupId: 'g1', groupName: 'Saturday crew', state: 'open', deadline: iso(1), voted: false, optionCount: 3, winnerName: null, ...over,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('Plans hub sections (P0-16)', () => {
  it('Needs your response: Needs reconfirmation first, then Awaiting reply, each by start time', () => {
    const hub = buildHub([
      plan('a', { status: 'awaiting', startAt: iso(2), endAt: iso(2, 22) }),
      plan('b', { status: 'needs_reconfirm', startAt: iso(5), endAt: iso(5, 22) }),
      plan('c', { status: 'awaiting', startAt: iso(1), endAt: iso(1, 22) }),
      plan('d', { status: 'needs_reconfirm', startAt: iso(4), endAt: iso(4, 22) }),
    ], [], NOW);
    expect(ids(hub.needsResponse)).toEqual(['d', 'b', 'c', 'a']);
    expect(hub.upcoming).toEqual([]);
  });

  it('a plan appears in exactly one section: answered plans move to Upcoming', () => {
    const plans = [plan('a', { status: 'going' }), plan('b', { status: 'cant_go' }), plan('c', { status: 'awaiting' }), plan('d', { isOrganizer: true })];
    const hub = buildHub(plans, [], NOW);
    expect(ids(hub.needsResponse)).toEqual(['c']);
    expect(ids(hub.upcoming).sort()).toEqual(['a', 'b', 'd']);
    expect(hub.needsResponse.length + hub.upcoming.length).toBe(plans.length);
  });

  it('after a material edit the plan moves from Upcoming to Needs your response', () => {
    const before = buildHub([plan('a', { status: 'going' })], [], NOW);
    expect(ids(before.upcoming)).toEqual(['a']);
    const after = buildHub([plan('a', { status: 'needs_reconfirm' })], [], NOW);
    expect(ids(after.needsResponse)).toEqual(['a']);
    expect(after.upcoming).toEqual([]);
  });

  it('the organizer never has a plan in Needs your response', () => {
    expect(buildHub([plan('a', { isOrganizer: true, status: 'going' })], [], NOW).needsResponse).toEqual([]);
  });

  it('Upcoming is by start time; a cancelled plan stays in place, labelled, until its original end time', () => {
    const hub = buildHub([
      plan('late', { startAt: iso(6), endAt: iso(6, 22) }),
      plan('cancelled', { state: 'cancelled', startAt: iso(2), endAt: iso(2, 22) }),
      plan('soon', { startAt: iso(1), endAt: iso(1, 22) }),
      plan('gone', { state: 'cancelled', startAt: iso(-3), endAt: iso(-3, 22) }),
    ], [], NOW);
    expect(ids(hub.upcoming)).toEqual(['soon', 'cancelled', 'late']);
    expect(hub.upcoming[1].state).toBe('cancelled');
  });

  it('a cancelled plan is never "needs your response"', () => {
    expect(buildHub([plan('a', { state: 'cancelled', status: 'awaiting' })], [], NOW).needsResponse).toEqual([]);
  });

  it('past plans are not shown', () => {
    expect(buildHub([plan('old', { startAt: iso(-2), endAt: iso(-2, 22) })], [], NOW).upcoming).toEqual([]);
  });

  it('open picks: Vote needed first, then voted, then closed ones waiting for a plan', () => {
    const hub = buildHub([], [
      pick('closed', { state: 'closed', voted: true, winnerName: 'Sketch' }),
      pick('voted', { voted: true, deadline: iso(0) }),
      pick('needed-late', { deadline: iso(3) }),
      pick('needed-soon', { deadline: iso(1) }),
    ], NOW);
    expect(ids(hub.picks)).toEqual(['needed-soon', 'needed-late', 'voted', 'closed']);
  });

  it('the Plans tab badge counts plans needing a response plus open picks not fully voted', () => {
    const hub = buildHub(
      [plan('a', { status: 'awaiting' }), plan('b', { status: 'needs_reconfirm' }), plan('c', { status: 'going' })],
      [pick('p1'), pick('p2', { voted: true }), pick('p3', { state: 'closed' })],
      NOW,
    );
    expect(hub.badge).toBe(3); // 2 plans + 1 pick still to vote on
  });

  it('is empty when there is nothing', () => {
    expect(buildHub([], [], NOW)).toEqual({ needsResponse: [], picks: [], upcoming: [], badge: 0 });
  });
});

describe('next item for a group (Friends tab)', () => {
  const fmt = { day: () => 'Sat Nov 14', when: () => 'Mon 9:12 AM' };
  it('prefers the earliest plan, then an open pick, then "No plan yet"', () => {
    const withPlan = buildHub([plan('a', { experienceName: 'Sketch and stroll' }), plan('b', { groupId: 'g2' })], [pick('p')], NOW);
    expect(nextItemForGroup('g1', withPlan, fmt)).toBe('Sketch and stroll, Sat Nov 14');
    const onlyPick = buildHub([], [pick('p')], NOW);
    expect(nextItemForGroup('g1', onlyPick, fmt)).toBe('Group pick open, closes Mon 9:12 AM');
    expect(nextItemForGroup('g2', onlyPick, fmt)).toBe('No plan yet');
  });
  it('ignores cancelled plans and closed picks', () => {
    const hub = buildHub([plan('a', { state: 'cancelled' })], [pick('p', { state: 'closed' })], NOW);
    expect(nextItemForGroup('g1', hub, fmt)).toBe('No plan yet');
  });
});
