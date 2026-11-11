export type PriceKind = 'exact' | 'estimated' | 'free' | 'unknown';
export type TimingKind = 'fixed' | 'flexible' | 'unknown';

export type Experience = {
  id: string;
  name: string;
  category: string;
  description: string;
  area: string | null;
  image_url: string | null;
  address: string | null;
  provider_name: string | null;
  price_kind: PriceKind;
  price_min: number | null;
  price_max: number | null;
  timing_kind: TimingKind;
  sessions: unknown;
  hours_text: string | null;
  duration_min: number | null;
  meeting_point: string | null;
  booking_required: boolean;
  booking_url: string | null;
  source: string;
  checked_on: string | null;
  status: string;
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function formatPrice(experience: Pick<Experience, 'price_kind' | 'price_min' | 'price_max'>) {
  const { price_kind: kind, price_min: min, price_max: max } = experience;
  if (kind === 'free') return 'Free';
  if (kind === 'unknown') return 'Price unknown. Check the source.';
  if (min == null) return 'Price unavailable. Check the source.';
  if (kind === 'exact') return `${dollars.format(min)} per person`;
  return max != null && max !== min
    ? `About ${dollars.format(min)} to ${dollars.format(max)}`
    : `About ${dollars.format(min)}`;
}

type Session = { start_local?: unknown };

function formatLocalSession(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(date);
}

export function formatTiming(experience: Pick<Experience, 'timing_kind' | 'sessions' | 'hours_text'>) {
  if (experience.timing_kind === 'unknown') {
    return { label: 'Hours unknown', detail: 'Check the source before making a plan.', sessions: [] as string[] };
  }
  if (experience.timing_kind === 'flexible') {
    return {
      label: experience.hours_text?.trim() || 'Flexible hours — check the source',
      detail: 'Pick any time within these hours', sessions: [] as string[],
    };
  }
  const raw = Array.isArray(experience.sessions) ? experience.sessions as Session[] : [];
  const sessions = raw.flatMap(session => typeof session.start_local === 'string'
    ? [formatLocalSession(session.start_local)].filter((value): value is string => Boolean(value)) : []);
  return {
    label: sessions.length ? 'Fixed sessions' : experience.hours_text?.trim() || 'Session times being checked',
    detail: 'Plans must use one of these sessions', sessions,
  };
}

export function formatDuration(minutes: number | null) {
  if (minutes == null) return 'Duration varies';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function formatLocation(experience: Pick<Experience, 'area' | 'address'>) {
  return [experience.area, experience.address].filter(Boolean).join(' · ') || 'Location being checked';
}

export function sourceUrl(source: string) {
  return source.match(/https?:\/\/[^\s)]+/)?.[0] ?? null;
}

export function formatCheckedOn(value: string | null) {
  if (!value) return 'Not yet checked';
  const [year, month, day] = value.split('-').map(Number);
  return `Checked on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))}`;
}
