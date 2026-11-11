// Checks a hosted Supabase project's sign-in and access rules over HTTP (TEC-1).
// Prints PASS/FAIL lines only, never keys or tokens. Run from app/ after filling .env:
//   npm run check:auth -- anon                       guests are off, signed-out visitors read nothing
//   npm run check:auth -- request you@team.com       sends a 6-digit code to that address
//   npm run check:auth -- verify you@team.com 123456 signs in with the code, then checks access rules
//   npm run check:auth -- reject you@team.com        a wrong code is refused
// Exit code is 0 when every check passes, 1 otherwise.
import { Buffer } from 'node:buffer';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const [command, email, code] = process.argv.slice(2);
let failed = false;

function report(ok, text) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failed = true;
}

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { status: response.status, json };
}

function usage() {
  console.error('Usage: npm run check:auth -- anon | request <email> | verify <email> <6-digit code> | reject <email>');
  process.exit(2);
}

if (!url || !key || url.includes('YOUR-PROJECT') || key === 'YOUR-ANON-KEY') {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env first (npm run check:env).');
  process.exit(1);
}
const needsEmail = command === 'request' || command === 'verify' || command === 'reject';
if (needsEmail && !/^\S+@\S+\.\S+$/.test(email ?? '')) usage();

if (command === 'anon') {
  const signup = await call('/auth/v1/signup', { method: 'POST', body: {} });
  report(signup.status >= 400 && !signup.json?.access_token, 'Anonymous sign-in is rejected (no guests)');
  const catalog = await call('/rest/v1/experiences?select=id&limit=1');
  report([401, 403].includes(catalog.status), 'Signed-out visitors cannot read the catalog');
} else if (command === 'request') {
  const sent = await call('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } });
  report(sent.status === 200, `Sign-in code requested for ${email}`);
  if (sent.status === 200) console.log('Check the inbox for a 6-digit code. It expires in 10 minutes.');
  if (sent.status === 429) console.log('Rate limited. Supabase\'s built-in email allows very few messages per hour; wait, or set up custom SMTP.');
} else if (command === 'reject') {
  const bad = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: '000000' } });
  report(bad.status >= 400 && !bad.json?.access_token, 'A wrong code is refused');
} else if (command === 'verify') {
  if (!/^\d{6}$/.test(code ?? '')) usage();
  const verified = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code } });
  const token = verified.json?.access_token;
  report(verified.status === 200 && Boolean(token), 'Code accepted, signed in');
  if (token) {
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}');
    report(claims.role === 'authenticated' && claims.is_anonymous !== true, 'Signed in as a real account, not a guest');
    for (const table of ['experiences', 'groups', 'picks', 'plans', 'votes']) {
      const read = await call(`/rest/v1/${table}?select=*&limit=1`, { token });
      report(read.status === 200 && Array.isArray(read.json), `Can read ${table} (returns only what this account may see)`);
    }
    const write = await call('/rest/v1/groups', { method: 'POST', body: { name: 'check' }, token });
    report([401, 403].includes(write.status), 'Direct writes to tables are refused');
  }
} else {
  usage();
}
process.exit(failed ? 1 : 0);
