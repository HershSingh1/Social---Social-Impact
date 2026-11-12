import { logEvent } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';

export const OTHER_MAX = 200;
export const CANCEL_REASONS = ['Weather', 'Not enough people', 'Venue closed', 'Other'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export type CancelField = 'reason' | 'other' | 'form';
export type CancelErrors = Partial<Record<CancelField, string>>;

/** Nothing picked, or Other without text. The text counts in characters, as the server does. */
export function validateCancel(choice: CancelReason | null, otherText: string): CancelErrors {
  if (!choice) return { reason: 'Pick a reason.' };
  if (choice !== 'Other') return {};
  const text = otherText.trim();
  if (!text) return { other: 'Say why, in a few words.' };
  if (Array.from(text).length > OTHER_MAX) return { other: `Use ${OTHER_MAX} characters or fewer.` };
  return {};
}

/** What invitees will read after "Maya cancelled this plan:". */
export const reasonText = (choice: CancelReason, otherText: string) => choice === 'Other' ? otherText.trim() : choice;

/** The sentence on a cancelled plan. The organizer's name is missing once their account is gone. */
export const cancelledLine = (organizer: string | undefined, reason: string | null) =>
  `${organizer ?? 'The organizer'} cancelled this plan${reason ? `: ${reason}` : ''}.`;

const SERVER_ERRORS: Record<string, [CancelField, string]> = {
  not_organizer: ['form', 'Only the person who made this plan can cancel it.'],
  plan_ended: ['form', 'This plan has already ended, so it can’t be cancelled.'],
  invalid_reason: ['other', 'Say why, in a few words.'],
};
export class CancelRefused extends Error {
  constructor(public readonly field: CancelField, message: string) { super(message); }
}

/** Cancelling twice is harmless on the server, so Try again after a lost reply is safe. */
export async function cancelPlan(planId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_plan', { plan_id: planId, reason });
  if (error) {
    const known = Object.keys(SERVER_ERRORS).find(code => error.message.includes(code));
    if (known) throw new CancelRefused(...SERVER_ERRORS[known]);
    throw error;
  }
  logEvent('plan_cancelled', { plan_id: planId });
}
