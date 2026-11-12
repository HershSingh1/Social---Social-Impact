import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { formatClock, formatWhen } from '../../lib/time';
import type { Plan, Price, Revision } from './plan';

/** A price without the "per person" tail, for a before and after: $12, About $12–$15, Free, not confirmed. */
export function priceShort({ kind, min, max }: Pick<Price, 'kind' | 'min' | 'max'>): string {
  if (kind === 'free') return 'Free';
  if (kind === 'unknown' || min === null) return 'not confirmed';
  const range = max !== null && max !== min ? `$${min}–$${max}` : `$${min}`;
  return kind === 'estimated' ? `About ${range}` : range;
}

/** "Price was $12, now $18" when the catalog changed the price after the plan was sent; otherwise null. */
export function priceChangeLine(price: Price): string | null {
  const before = price.previous;
  if (!before) return null;
  const was = priceShort(before);
  const now = priceShort(price);
  return was === now ? null : `Price was ${was}, now ${now}`;
}

export type ChangeRow = { label: string; before: string; after: string };
const when = (r: Revision) => `${formatWhen(r.startAt)} to ${formatClock(r.endAt)}`;
const booking = (r: Revision) => r.bookingRequired === null ? 'Booking not confirmed'
  : r.bookingRequired ? 'Booking required' : 'No booking needed';

/** Every field that differs between the revision someone answered and the current one, old and new. */
export function changeRows(was: Revision, now: Revision): ChangeRow[] {
  const rows: ChangeRow[] = [];
  if (when(was) !== when(now)) rows.push({ label: 'When', before: when(was), after: when(now) });
  if (was.meetingPoint !== now.meetingPoint) rows.push({ label: 'Where', before: was.meetingPoint, after: now.meetingPoint });
  if (priceShort(was.price) !== priceShort(now.price)) rows.push({ label: 'Price', before: priceShort(was.price), after: priceShort(now.price) });
  if (was.bookingRequired !== now.bookingRequired) rows.push({ label: 'Booking', before: booking(was), after: booking(now) });
  return rows;
}

// "Updated" (P0-14): a minor edit changes the plan row but not its revision. The server keeps no per-person
// "seen" marker, so this phone remembers what it last showed; the label means "changed since you last looked".
const seenKey = (planId: string) => `sidequest.planSeen:${planId}`;
type Seen = { revision: number; updatedAt: string };

/** True when the plan was edited without a new revision since it was last shown. A material edit has its own banner. */
export function isMinorUpdate(seen: Seen | null, now: Seen): boolean {
  return Boolean(seen) && seen!.revision === now.revision && Date.parse(now.updatedAt) > Date.parse(seen!.updatedAt);
}

/** Whether to show the Updated label for this person, and remembers what is shown now. Not used for the organizer. */
export function usePlanUpdated(plan: Plan | undefined, viewerId: string): boolean {
  const [updated, setUpdated] = useState(false);
  const id = plan?.id;
  const revision = plan?.current.revision;
  const updatedAt = plan?.updatedAt;
  const organizer = plan?.organizerId === viewerId;
  useEffect(() => {
    if (!id || revision === undefined || !updatedAt || organizer) return;
    const now = { revision, updatedAt };
    void (async () => {
      let seen: Seen | null = null;
      try { seen = JSON.parse((await AsyncStorage.getItem(seenKey(id))) ?? 'null') as Seen | null; } catch { seen = null; }
      if (isMinorUpdate(seen, now)) setUpdated(true);
      else if (!seen || seen.revision !== revision) setUpdated(false);
      try { await AsyncStorage.setItem(seenKey(id), JSON.stringify(now)); } catch { /* the label is a convenience */ }
    })();
  }, [id, revision, updatedAt, organizer]);
  return updated;
}
