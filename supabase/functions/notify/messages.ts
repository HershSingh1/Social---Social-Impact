// Message text for each notification kind (spec P1-04 table). Pure: no network, no database.
export type Kind =
  | 'plan_sent' | 'pick_opened' | 'pick_closing' | 'pick_result'
  | 'material_change' | 'cancellation' | 'organizer_nudge';

// One claimed outbox row plus the pieces its text needs (see public.claim_notifications).
export type Claimed = {
  log_id: string;
  kind: Kind;
  user_id: string;
  plan_id: string | null;
  pick_id: string | null;
  tokens: string[];
  actor_name: string | null;
  subject: string | null;
  group_name: string | null;
  at_time: string | null;
  prev_at_time: string | null;
  time_zone: string | null;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { kind: Kind; plan_id?: string; pick_id?: string };
};

const MAX_BODY = 178;

function parts(iso: string, zone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { day: p.weekday, time: `${p.hour}:${p.minute} ${p.dayPeriod}` };
}

// "Sat 2:00 PM", shown in the plan's own time zone (rule 4).
export function formatWhen(iso: string, zone: string): string {
  const { day, time } = parts(iso, zone);
  return `${day} ${time}`;
}

function sameDay(a: string, b: string, zone: string): boolean {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' });
  return f.format(new Date(a)) === f.format(new Date(b));
}

export function bodyFor(row: Claimed): string {
  const zone = row.time_zone ?? 'America/Chicago';
  const actor = row.actor_name?.trim() || 'Someone';
  const subject = row.subject?.trim() || 'your plan';
  const at = row.at_time;
  let text: string;
  switch (row.kind) {
    case 'plan_sent':
      text = at ? `${actor} invited you: ${subject}, ${formatWhen(at, zone)}` : `${actor} invited you: ${subject}`;
      break;
    case 'pick_opened': {
      const title = (row.subject?.trim() || 'What should we do?');
      const lead = /[?!.]$/.test(title) ? title : `${title}.`;
      text = at ? `Vote: ${lead} Closes ${formatWhen(at, zone)}` : `Vote: ${lead}`;
      break;
    }
    case 'pick_closing':
      text = `1 hour left to vote in ${row.group_name?.trim() || 'your group'}`;
      break;
    case 'pick_result':
      text = `${row.subject?.trim() || 'An activity'} won the vote`;
      break;
    case 'material_change':
      if (at && row.prev_at_time && at !== row.prev_at_time) {
        const t = parts(at, zone);
        const when = sameDay(at, row.prev_at_time, zone) ? t.time : `${t.day} ${t.time}`;
        text = `Time changed to ${when}. Still going?`;
      } else {
        text = 'Plan details changed. Still going?';
      }
      break;
    case 'cancellation':
      text = `${actor} cancelled ${subject}`;
      break;
    case 'organizer_nudge':
      text = `${actor} is waiting on your answer`;
      break;
  }
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
}

// One message per device. `data` holds ids only, so the app can open the right plan or pick on tap.
export function messagesFor(row: Claimed): PushMessage[] {
  const data: PushMessage['data'] = { kind: row.kind };
  if (row.plan_id) data.plan_id = row.plan_id;
  if (row.pick_id) data.pick_id = row.pick_id;
  const body = bodyFor(row);
  return row.tokens.map((to) => ({ to, title: 'Sidequest', body, sound: 'default', data }));
}
