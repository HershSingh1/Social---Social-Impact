// Unit tests for the notify function, run with `node --test supabase/functions/notify` (Node 24+, no Deno
// needed). The Expo client and the database are fakes; nothing here touches the network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeEqual } from './auth.ts';
import { EXPO_SEND_URL, expoClient, type PushClient, type Ticket } from './expo.ts';
import { bodyFor, type Claimed, messagesFor } from './messages.ts';
import { processOutbox, type Store } from './send.ts';

const row = (over: Partial<Claimed> = {}): Claimed => ({
  log_id: 'r1', kind: 'organizer_nudge', user_id: 'u1', plan_id: 'p1', pick_id: null, tokens: ['ExponentPushToken[a]'],
  actor_name: 'Maya', subject: 'Sketch and stroll', group_name: null, at_time: null, prev_at_time: null,
  time_zone: 'America/Chicago', ...over,
});

function fakeStore(rows: Claimed[]) {
  const calls = { claim: [] as number[], sent: [] as string[][], removed: [] as string[][] };
  const store: Store = {
    async claim(n) { calls.claim.push(n); return rows; },
    async markSent(ids) { calls.sent.push(ids); },
    async removeTokens(t) { calls.removed.push(t); },
  };
  return { store, calls };
}
const ok: Ticket = { status: 'ok' };
const err = (error: string): Ticket => ({ status: 'error', error });

test('text for each kind follows the P1-04 table', () => {
  // 2026-11-21 20:00 UTC is Saturday 2:00 PM in Austin (CST, UTC-6).
  const sat2pm = '2026-11-21T20:00:00Z';
  assert.equal(bodyFor(row({ kind: 'plan_sent', at_time: sat2pm })), 'Maya invited you: Sketch and stroll, Sat 2:00 PM');
  assert.equal(
    bodyFor(row({ kind: 'pick_opened', subject: 'What should we do this weekend?', at_time: '2026-11-23T15:12:00Z' })),
    'Vote: What should we do this weekend? Closes Mon 9:12 AM');
  assert.equal(bodyFor(row({ kind: 'pick_closing', group_name: 'Saturday crew' })), '1 hour left to vote in Saturday crew');
  assert.equal(bodyFor(row({ kind: 'pick_result' })), 'Sketch and stroll won the vote');
  assert.equal(
    bodyFor(row({ kind: 'material_change', at_time: '2026-11-21T21:00:00Z', prev_at_time: sat2pm })),
    'Time changed to 3:00 PM. Still going?');
  assert.equal(
    bodyFor(row({ kind: 'material_change', at_time: '2026-11-22T21:00:00Z', prev_at_time: sat2pm })),
    'Time changed to Sun 3:00 PM. Still going?');
  assert.equal(bodyFor(row({ kind: 'material_change', at_time: sat2pm, prev_at_time: sat2pm })), 'Plan details changed. Still going?');
  assert.equal(bodyFor(row({ kind: 'cancellation' })), 'Maya cancelled Sketch and stroll');
  assert.equal(bodyFor(row({ kind: 'organizer_nudge' })), 'Maya is waiting on your answer');
});

test('times are shown in the plan time zone, across daylight saving', () => {
  // 2026-07-04 19:00 UTC is 2:00 PM in Austin (CDT, UTC-5).
  assert.equal(bodyFor(row({ kind: 'plan_sent', at_time: '2026-07-04T19:00:00Z' })), 'Maya invited you: Sketch and stroll, Sat 2:00 PM');
});

test('missing names fall back to plain words and long text is cut', () => {
  assert.equal(bodyFor(row({ kind: 'cancellation', actor_name: null, subject: null })), 'Someone cancelled your plan');
  assert.ok(bodyFor(row({ kind: 'cancellation', subject: 'x'.repeat(500) })).length <= 178);
});

test('messages carry one entry per device and ids only in data', () => {
  const msgs = messagesFor(row({ tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'], pick_id: null }));
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs.map((m) => m.to), ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  assert.deepEqual(msgs[0].data, { kind: 'organizer_nudge', plan_id: 'p1' });
});

test('rows are sent in requests of at most 100 messages and never split across requests', async () => {
  const rows = Array.from({ length: 70 }, (_, i) => row({ log_id: `r${i}`, tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'] }));
  const sizes: number[] = [];
  const push: PushClient = { async send(m) { sizes.push(m.length); return m.map(() => ok); } };
  const { store, calls } = fakeStore(rows);
  const s = await processOutbox(store, push);
  assert.ok(sizes.every((n) => n <= 100), `sizes ${sizes}`);
  assert.deepEqual(sizes, [99, 99, 12]); // 33 + 33 + 4 rows of 3 devices
  assert.equal(s.claimed, 70);
  assert.equal(s.sent, 70);
  assert.equal(calls.sent.flat().length, 70);
  assert.equal(calls.sent.length, 3); // marked after each request, so a crash replays at most one request
});

test('a failed request leaves its rows unsent', async () => {
  const push: PushClient = { async send() { throw new Error('expo_http_503'); } };
  const { store, calls } = fakeStore([row({ log_id: 'a' }), row({ log_id: 'b' })]);
  const s = await processOutbox(store, push);
  assert.deepEqual(calls.sent, []);
  assert.deepEqual(s, { claimed: 2, sent: 0, retry: 2, tokensRemoved: 0, requests: 1 });
});

test('a failed request does not stop the requests after it', async () => {
  const rows = [row({ log_id: 'a', tokens: Array(60).fill('ExponentPushToken[a]') }), row({ log_id: 'b', tokens: Array(60).fill('ExponentPushToken[b]') })];
  let n = 0;
  const push: PushClient = { async send(m) { if (n++ === 0) throw new Error('expo_http_500'); return m.map(() => ok); } };
  const { store, calls } = fakeStore(rows);
  const s = await processOutbox(store, push);
  assert.deepEqual(calls.sent, [['b']]);
  assert.equal(s.retry, 1);
});

test('a temporary per-device error leaves the row unsent', async () => {
  const push: PushClient = { async send(m) { return m.map(() => err('MessageRateExceeded')); } };
  const { store, calls } = fakeStore([row()]);
  const s = await processOutbox(store, push);
  assert.deepEqual(calls.sent, []);
  assert.deepEqual(calls.removed, []);
  assert.equal(s.retry, 1);
});

test('an invalid token is removed and the row, with no device left, is settled', async () => {
  const push: PushClient = { async send(m) { return m.map(() => err('DeviceNotRegistered')); } };
  const { store, calls } = fakeStore([row()]);
  const s = await processOutbox(store, push);
  assert.deepEqual(calls.removed, [['ExponentPushToken[a]']]);
  assert.deepEqual(calls.sent, [['r1']]);
  assert.equal(s.tokensRemoved, 1);
});

test('one good device settles the row and the bad token is still removed', async () => {
  const tokens = ['ExponentPushToken[good]', 'ExponentPushToken[dead]'];
  const push: PushClient = { async send() { return [ok, err('DeviceNotRegistered')]; } };
  const { store, calls } = fakeStore([row({ tokens })]);
  await processOutbox(store, push);
  assert.deepEqual(calls.removed, [['ExponentPushToken[dead]']]);
  assert.deepEqual(calls.sent, [['r1']]);
});

test('a dead token plus a temporary failure stays unsent', async () => {
  const tokens = ['ExponentPushToken[dead]', 'ExponentPushToken[slow]'];
  const push: PushClient = { async send() { return [err('DeviceNotRegistered'), err('MessageRateExceeded')]; } };
  const { store, calls } = fakeStore([row({ tokens })]);
  await processOutbox(store, push);
  assert.deepEqual(calls.removed, [['ExponentPushToken[dead]']]);
  assert.deepEqual(calls.sent, []);
});

test('an empty outbox sends nothing', async () => {
  const push: PushClient = { async send() { throw new Error('should not be called'); } };
  const { store } = fakeStore([]);
  assert.deepEqual(await processOutbox(store, push, { batchSize: 25 }), { claimed: 0, sent: 0, retry: 0, tokensRemoved: 0, requests: 0 });
});

test('the summary holds counts only, no tokens or text', async () => {
  const push: PushClient = { async send(m) { return m.map(() => ok); } };
  const { store } = fakeStore([row()]);
  const text = JSON.stringify(await processOutbox(store, push));
  assert.ok(!text.includes('ExponentPushToken') && !text.includes('Maya'));
});

test('the Expo client posts JSON with the access token and maps tickets', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'x' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = expoClient({ fetch: fakeFetch, accessToken: 'secret-token' });
  const tickets = await client.send(messagesFor(row({ tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] })));
  assert.deepEqual(tickets, [ok, err('DeviceNotRegistered')]);
  assert.equal(seen?.url, EXPO_SEND_URL);
  assert.equal((seen?.init.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(String(seen?.init.body)).length, 2);
});

test('the Expo client throws on HTTP errors and malformed replies, without echoing the reply', async () => {
  const http = expoClient({ fetch: (async () => new Response('token ExponentPushToken[a] leaked', { status: 429 })) as unknown as typeof fetch });
  await assert.rejects(http.send(messagesFor(row())), (e: Error) => e.message === 'expo_http_429');
  const short = expoClient({ fetch: (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch });
  await assert.rejects(short.send(messagesFor(row())), (e: Error) => e.message === 'expo_bad_response');
  const big = expoClient({ fetch: (async () => new Response('{}')) as unknown as typeof fetch });
  await assert.rejects(big.send(Array(101).fill(messagesFor(row())[0])), (e: Error) => e.message === 'expo_batch_too_large');
});

test('safeEqual compares secrets', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
  assert.ok(!safeEqual('', 'abc'));
});
