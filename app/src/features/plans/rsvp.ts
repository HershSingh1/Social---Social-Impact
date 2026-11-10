import type { RsvpStatus } from '@/types/database';

export const STATUS_LABEL: Record<RsvpStatus, string> = {
  going: 'Going',
  awaiting: 'Awaiting reply',
  cant_go: "Can't go",
  needs_reconfirm: 'Needs reconfirmation',
};
export const STATUS_TONE: Record<RsvpStatus, 'success' | 'neutral' | 'danger' | 'warn'> = {
  going: 'success', awaiting: 'neutral', cant_go: 'danger', needs_reconfirm: 'warn',
};

export type Counts = { going: number; awaiting: number; cant_go: number; needs_reconfirm: number };

/** Going, Awaiting, Can't go, Needs reconfirmation: always add up to the number of invitees (organizer included). */
export function countRsvps(rows: { status: RsvpStatus }[]): Counts {
  const c: Counts = { going: 0, awaiting: 0, cant_go: 0, needs_reconfirm: 0 };
  for (const r of rows) c[r.status] += 1;
  return c;
}

/** How many people a material edit will ask to reconfirm: every Going invitee except the organizer. */
export function reconfirmCount(rows: { user_id: string; status: RsvpStatus }[], organizerId: string): number {
  return rows.filter((r) => r.status === 'going' && r.user_id !== organizerId).length;
}

export const countsSummary = (c: Counts) => `${c.going} Going, ${c.awaiting} Awaiting, ${c.cant_go} Can't go, ${c.needs_reconfirm} to reconfirm`;
