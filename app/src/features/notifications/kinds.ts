// The seven kinds in the P1-04 table (decision N4), with the label and an example for Settings. The ids match
// `private.notification_kinds()` on the server. Quiet hours and "everyone's free" alerts are not in P1.
export type Kind = 'plan_sent' | 'pick_opened' | 'pick_closing' | 'pick_result' | 'material_change' | 'cancellation' | 'organizer_nudge';

export const KINDS: { kind: Kind; label: string; example: string }[] = [
  { kind: 'plan_sent', label: 'Plan sent to you', example: '“Maya invited you: Sketch and stroll, Sat 2:00 PM”' },
  { kind: 'pick_opened', label: 'Pick opened', example: '“Vote: What should we do this weekend?”' },
  { kind: 'pick_closing', label: 'Pick closes in 1 hour', example: '“1 hour left to vote in Saturday crew”' },
  { kind: 'pick_result', label: 'Pick result', example: '“Sketch and stroll won the vote”' },
  { kind: 'material_change', label: 'Change to a plan you’re going to', example: '“Time changed to 3:00 PM. Still going?”' },
  { kind: 'cancellation', label: 'Plan cancelled', example: '“Maya cancelled Sketch and stroll”' },
  { kind: 'organizer_nudge', label: 'Nudges from an organizer', example: '“Maya is waiting on your answer”' },
];
