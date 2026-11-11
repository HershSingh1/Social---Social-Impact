// Fires 10 parallel send_plan calls with one client_key at a hosted Supabase project and checks that
// exactly one plan and one invitation exist (backend half of T04, TEC-31). Prints PASS/FAIL only,
// never keys or tokens. Run from app/ after the migrations are applied to that project:
//   SIDEQUEST_TEST_TOKEN=<access token of a signed-in test user with a profile name> \
//   SIDEQUEST_TEST_GROUP=<group id that user belongs to> \
//   SIDEQUEST_TEST_EXPERIENCE=<published, non-fixed experience id> \
//   npm run check:send-plan
// Each run creates one real plan in that group. Exit code is 0 when every check passes, 1 otherwise.
import { randomUUID } from 'node:crypto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const token = process.env.SIDEQUEST_TEST_TOKEN;
const group = process.env.SIDEQUEST_TEST_GROUP;
const experience = process.env.SIDEQUEST_TEST_EXPERIENCE;
const PARALLEL = 10;
let failed = false;

function report(ok, text) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failed = true;
}

if (!url || !anon || url.includes('YOUR-PROJECT') || anon === 'YOUR-ANON-KEY') {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env first (npm run check:env).');
  process.exit(1);
}
if (!token || !group || !experience) {
  console.error('Set SIDEQUEST_TEST_TOKEN, SIDEQUEST_TEST_GROUP and SIDEQUEST_TEST_EXPERIENCE (see the top of this file).');
  process.exit(2);
}

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { status: response.status, json };
}

// America/Chicago wall clock three days from now, as the app sends it.
function chicagoLocal(hoursAhead) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + hoursAhead * 3600_000));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const key = randomUUID();
const body = {
  client_key: key, group_id: group, experience_id: experience,
  start_local: chicagoLocal(72), end_local: chicagoLocal(74),
  meeting_point: 'Concurrency check', note: null, recipients: [], pick_id: null, time_zone: 'America/Chicago',
};

const results = await Promise.all(Array.from({ length: PARALLEL }, () => call('/rest/v1/rpc/send_plan', { method: 'POST', body })));
const ids = results.map((r) => (r.status === 200 && typeof r.json === 'string' ? r.json : null));
report(ids.every(Boolean), `All ${PARALLEL} parallel sends succeeded (statuses: ${[...new Set(results.map((r) => r.status))].join(', ')})`);
const unique = new Set(ids.filter(Boolean));
report(unique.size === 1, `All sends returned the same plan id (${unique.size} distinct)`);

const plans = await call(`/rest/v1/plans?client_key=eq.${key}&select=id`);
report(plans.status === 200 && Array.isArray(plans.json) && plans.json.length === 1, `Exactly one plan has this client_key (found ${plans.json?.length ?? 'none'})`);
if (unique.size === 1) {
  const [planId] = unique;
  const rsvps = await call(`/rest/v1/rsvps?plan_id=eq.${planId}&select=user_id,status`);
  report(rsvps.status === 200 && rsvps.json?.length === 1 && rsvps.json[0].status === 'going',
    `One invitation, the organizer, Going (found ${rsvps.json?.length ?? 'none'})`);
}
process.exit(failed ? 1 : 0);
