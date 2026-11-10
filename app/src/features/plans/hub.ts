import type { RsvpStatus } from '@/types/database';

export type HubPlan = {
  id: string;
  groupId: string;
  groupName: string;
  experienceName: string;
  startAt: string;
  endAt: string;
  state: 'sent' | 'cancelled';
  /** the viewer's own status on this plan (the organizer is always going) */
  status: RsvpStatus;
  isOrganizer: boolean;
};

export type HubPick = {
  id: string;
  groupId: string;
  groupName: string;
  state: 'open' | 'closed';
  deadline: string;
  /** the viewer has voted on every option */
  voted: boolean;
  optionCount: number;
  /** name of the chosen option once closed */
  winnerName: string | null;
};

export type Hub = {
  needsResponse: HubPlan[];
  picks: HubPick[];
  upcoming: HubPlan[];
  /** Plans tab badge: plans needing an answer plus open picks the viewer has not fully voted on */
  badge: number;
};

const byStart = (a: HubPlan, b: HubPlan) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime();

/**
 * P0-16: every plan appears in exactly one section.
 *  - Needs your response: Needs reconfirmation first, then Awaiting reply, each by start time.
 *  - Open group picks: "Vote needed" first, then ones you voted on, then closed ones waiting for a plan.
 *  - Upcoming: by start time; a cancelled plan stays in place, labelled, until its original end time.
 * Past plans are not shown (the Past section is pilot scope).
 */
export function buildHub(plans: HubPlan[], picks: HubPick[], now: Date = new Date()): Hub {
  const live = plans.filter((p) => new Date(p.endAt).getTime() >= now.getTime());

  const needsResponse = live
    .filter((p) => p.state === 'sent' && !p.isOrganizer && (p.status === 'needs_reconfirm' || p.status === 'awaiting'))
    .sort((a, b) => Number(b.status === 'needs_reconfirm') - Number(a.status === 'needs_reconfirm') || byStart(a, b));
  const needsIds = new Set(needsResponse.map((p) => p.id));
  const upcoming = live.filter((p) => !needsIds.has(p.id)).sort(byStart);

  const rank = (p: HubPick) => (p.state === 'open' ? (p.voted ? 1 : 0) : 2);
  const sortedPicks = [...picks].sort(
    (a, b) => rank(a) - rank(b) || new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
  );

  const badge = needsResponse.length + picks.filter((p) => p.state === 'open' && !p.voted).length;
  return { needsResponse, picks: sortedPicks, upcoming, badge };
}

/** The next thing for a group, for the Friends tab: its earliest upcoming plan, else an open pick, else nothing. */
export function nextItemForGroup(
  groupId: string,
  hub: Hub,
  fmt: { day: (iso: string) => string; when: (iso: string) => string },
): string {
  const plans = [...hub.needsResponse, ...hub.upcoming].filter((p) => p.groupId === groupId && p.state === 'sent').sort(byStart);
  if (plans[0]) return `${plans[0].experienceName}, ${fmt.day(plans[0].startAt)}`;
  const open = hub.picks.find((p) => p.groupId === groupId && p.state === 'open');
  if (open) return `Group pick open, closes ${fmt.when(open.deadline)}`;
  return 'No plan yet';
}
