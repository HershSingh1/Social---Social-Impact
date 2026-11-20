// Writes Free or Busy answers from the calendar for the proposed times of a pick (source = 'calendar'). Only a yes or no leaves the phone.
import { setAvailability } from '../availability/api';
import { getAccess, loadCounted, readEvents, listCalendars } from './device';
import { answersFor, type ProposedTime } from './overlap';

export type PrefillInput = {
  userId: string;
  /** Only runs when the person shared their calendar with this group. */
  shared: boolean;
  times: ProposedTime[];
  /** Times the person already answered by hand are left alone (the server keeps manual answers anyway). */
  answered: ReadonlySet<string>;
};

/** Returns how many answers were written. Does nothing without access, without a share, or when nothing is left to answer. */
export async function prefillFromCalendar({ userId, shared, times, answered }: PrefillInput): Promise<number> {
  const todo = times.filter(t => !answered.has(t.optionId));
  if (!shared || todo.length === 0 || await getAccess() !== 'granted') return 0;
  const counted = await loadCounted(userId);
  const ids = (await listCalendars()).map(c => c.id).filter(id => !counted || counted.includes(id));
  const starts = todo.map(t => Date.parse(t.startAt)).filter(n => !Number.isNaN(n));
  if (!starts.length) return 0;
  const longest = Math.max(...todo.map(t => t.durationMin ?? 120));
  const events = await readEvents(ids, new Date(Math.min(...starts)), new Date(Math.max(...starts) + longest * 60_000));
  const answers = answersFor(todo, events);
  for (const a of answers) await setAvailability(a.optionId, a.status, 'calendar');
  return answers.length;
}
