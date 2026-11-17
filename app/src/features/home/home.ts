// Pure helpers for the Home screen (Figma 2.1, node 28:3386).
import { closesIn, formatWhen, PLAN_TIME_ZONE, zoneAbbr } from '../../lib/time';
import type { GroupSummary } from '../groups/overview';
import { buildPlansHub, type HubPick, type HubPlan } from '../plans/hub';

export type NeedsInputItem = {
  key: string;
  kind: 'vote' | 'answer';
  title: string;
  detail: string;
  action: 'Vote' | 'Answer';
  href: string;
};

export type UpNext = { id: string; title: string; when: string; groupName: string };

const dateLine = new Intl.DateTimeFormat('en-US', { timeZone: PLAN_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric' });
const shortTime = new Intl.DateTimeFormat('en-US', { timeZone: PLAN_TIME_ZONE, weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** "Thursday, Nov 13", in Austin time. */
export const todayLine = (now: Date) => dateLine.format(now);

/** "Hi, Hersh". Without a name it stays friendly rather than showing a blank. */
export const greeting = (displayName: string | null | undefined) => {
  const name = displayName?.trim();
  return name ? `Hi, ${name}` : 'Hi there';
};

/** The next plan that is on for the viewer: sent, still ahead, and they said Going. Plans they still owe an
 * answer on are in Needs your input instead. */
export function pickUpNext(plans: HubPlan[], now = new Date()): UpNext | null {
  const next = plans
    .filter(plan => plan.state === 'sent' && plan.viewerStatus === 'going' && Date.parse(plan.endAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
  if (!next) return null;
  return {
    id: next.id,
    title: next.experienceName,
    when: `${formatWhen(next.startAt)} ${zoneAbbr(new Date(next.startAt))}`,
    groupName: next.groupName,
  };
}

/** Open votes the viewer hasn't finished, then plans waiting on their RSVP. Same rules as the Plans tab badge. */
export function needsInput(data: { plans: HubPlan[]; picks: HubPick[] }, now = new Date()): NeedsInputItem[] {
  const hub = buildPlansHub(data, now);
  const votes = hub.openPicks.filter(pick => !pick.viewerComplete).map((pick): NeedsInputItem => ({
    key: `pick-${pick.id}`, kind: 'vote', title: `Vote on ${pick.title}`,
    detail: `${pick.groupName} · ${closesIn(pick.deadline, now.getTime())}`, action: 'Vote', href: `/pick/${pick.id}`,
  }));
  const answers = hub.needsResponse.map((plan): NeedsInputItem => ({
    key: `plan-${plan.id}`, kind: 'answer', title: `RSVP to ${plan.experienceName}`,
    detail: `${plan.groupName} · ${formatWhen(plan.startAt)}`, action: 'Answer', href: `/plan/${plan.id}`,
  }));
  return [...votes, ...answers];
}

/** "Vote open · closes in 5 h", "Plan confirmed · Fri 8 PM" or "Nothing planned yet". */
export function groupState(group: GroupSummary, now = Date.now()): string {
  if (group.openPick) return `Vote open · ${closesIn(group.openPick.deadline, now)}`;
  if (group.nextPlan) {
    const parts = Object.fromEntries(shortTime.formatToParts(new Date(group.nextPlan.startAt)).map(part => [part.type, part.value]));
    const clock = parts.minute === '00' ? parts.hour : `${parts.hour}:${parts.minute}`;
    return `Plan confirmed · ${parts.weekday} ${clock} ${parts.dayPeriod}`;
  }
  return 'Nothing planned yet';
}

export const goingLabel = (count: number) => `${count} going`;
