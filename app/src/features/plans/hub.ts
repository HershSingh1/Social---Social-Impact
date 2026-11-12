export type ViewerPlanStatus = 'going' | 'cant_go' | 'awaiting' | 'needs_reconfirm';

export type HubPlan = {
  id: string;
  experienceName: string;
  groupName: string;
  state: 'sent' | 'cancelled';
  startAt: string;
  endAt: string;
  viewerStatus: ViewerPlanStatus | null;
};

export type HubPick = {
  id: string;
  title: string;
  groupName: string;
  state: 'open' | 'closed' | 'planned' | 'cancelled';
  deadline: string;
  viewerComplete: boolean;
};

export type PlanHubItem = HubPlan & { kind: 'plan'; statusLabel: string };
export type PickHubItem = HubPick & { kind: 'pick'; statusLabel: string };

export type PlansHub = {
  needsResponse: PlanHubItem[];
  openPicks: PickHubItem[];
  upcoming: PlanHubItem[];
  /** Ended in the last 90 days, newest first. "Past" means the end time passed, not that anyone went. */
  past: PlanHubItem[];
  badgeCount: number;
  isEmpty: boolean;
};

export const EMPTY_HUB_DATA = { plans: [] as HubPlan[], picks: [] as HubPick[] };

const responsePriority: Record<ViewerPlanStatus, number> = {
  needs_reconfirm: 0,
  awaiting: 1,
  going: 2,
  cant_go: 3,
};

/** How many days Past reaches back. */
export const PAST_DAYS = 90;

const pastLabel = (plan: HubPlan) => {
  if (plan.state === 'cancelled') return 'Cancelled';
  if (plan.viewerStatus === 'going') return 'You said Going';
  if (plan.viewerStatus === 'cant_go') return 'You said Can’t go';
  return 'No reply';
};

const statusLabel = (plan: HubPlan) => {
  if (plan.state === 'cancelled') return 'Cancelled';
  switch (plan.viewerStatus) {
    case 'needs_reconfirm': return 'Needs reconfirmation';
    case 'awaiting': return 'Awaiting reply';
    case 'going': return 'Going';
    case 'cant_go': return "Can’t go";
    default: return 'Invited';
  }
};

export function buildPlansHub(
  data: { plans: HubPlan[]; picks: HubPick[] },
  now: Date = new Date(),
): PlansHub {
  const nowMs = now.getTime();
  const needsResponse: PlanHubItem[] = [];
  const upcoming: PlanHubItem[] = [];
  const past: PlanHubItem[] = [];
  const pastFrom = nowMs - PAST_DAYS * 86_400_000;

  for (const plan of data.plans) {
    if (Date.parse(plan.endAt) <= nowMs) {
      if (Date.parse(plan.endAt) > pastFrom) past.push({ ...plan, kind: 'plan', statusLabel: pastLabel(plan) });
      continue;
    }
    const item: PlanHubItem = { ...plan, kind: 'plan', statusLabel: statusLabel(plan) };
    if (plan.state === 'sent' && (plan.viewerStatus === 'needs_reconfirm' || plan.viewerStatus === 'awaiting')) {
      needsResponse.push(item);
    } else {
      upcoming.push(item);
    }
  }

  needsResponse.sort((a, b) => {
    const priority = responsePriority[a.viewerStatus!] - responsePriority[b.viewerStatus!];
    return priority || Date.parse(a.startAt) - Date.parse(b.startAt);
  });
  upcoming.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  past.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

  const openPicks: PickHubItem[] = data.picks
    .filter(pick => pick.state === 'open')
    .map((pick): PickHubItem => ({ ...pick, kind: 'pick', statusLabel: pick.viewerComplete ? 'You voted' : 'Vote needed' }))
    .sort((a, b) => Number(a.viewerComplete) - Number(b.viewerComplete)
      || Date.parse(a.deadline) - Date.parse(b.deadline));

  const badgeCount = needsResponse.length + openPicks.filter(pick => !pick.viewerComplete).length;
  return {
    needsResponse,
    openPicks,
    upcoming,
    past,
    badgeCount,
    isEmpty: needsResponse.length + openPicks.length + upcoming.length + past.length === 0,
  };
}

const dateParts = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', day: 'numeric', timeZone: 'America/Chicago',
});
const time = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
});

export function formatDateBlock(iso: string) {
  const parts = dateParts.formatToParts(new Date(iso));
  return {
    weekday: parts.find(part => part.type === 'weekday')?.value.toUpperCase() ?? '',
    day: parts.find(part => part.type === 'day')?.value ?? '',
  };
}

export function formatTimeRange(startAt: string, endAt: string) {
  return `${time.format(new Date(startAt))}–${time.format(new Date(endAt))}`;
}

export function formatPickDeadline(deadline: string) {
  const date = new Date(deadline);
  return `Closes ${dateParts.format(date)}, ${time.format(date)}`;
}
