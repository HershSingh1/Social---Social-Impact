// Where a tapped notification goes. The server sends ids only (kind, plan_id, pick_id). Anything that is missing or
// not an id opens Home, so a tap never lands on a blank screen. A plan or pick that is already answered, closed or
// cancelled still opens its own screen, which shows its current status.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routeFor(data: unknown): string {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (typeof d.plan_id === 'string' && UUID.test(d.plan_id)) return `/plan/${d.plan_id}`;
  if (typeof d.pick_id === 'string' && UUID.test(d.pick_id)) return `/pick/${d.pick_id}`;
  return '/';
}
