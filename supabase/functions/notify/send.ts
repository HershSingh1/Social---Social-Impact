// Works through the outbox: claim rows, send, mark the ones that went out, drop dead tokens.
// It decides nothing about who is told what; the database already did (rows in notification_log).
import { type Claimed, messagesFor, type PushMessage } from './messages.ts';
import { MAX_PER_REQUEST, type PushClient } from './expo.ts';

export type Store = {
  claim(batchSize: number): Promise<Claimed[]>;
  markSent(ids: string[]): Promise<void>;
  removeTokens(tokens: string[]): Promise<void>;
};

export type Summary = { claimed: number; sent: number; retry: number; tokensRemoved: number; requests: number };

// Expo's code for a token that is no longer registered to a device.
const INVALID = 'DeviceNotRegistered';

// Rows are grouped into requests without splitting a row across two, so a row is settled by exactly one
// response. The database caps a row at 10 tokens, so a row always fits in a request.
function chunks(rows: Claimed[]): Claimed[][] {
  const out: Claimed[][] = [];
  let cur: Claimed[] = [];
  let n = 0;
  for (const r of rows) {
    const size = Math.min(r.tokens.length, MAX_PER_REQUEST);
    if (cur.length > 0 && n + size > MAX_PER_REQUEST) { out.push(cur); cur = []; n = 0; }
    cur.push(r);
    n += size;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export async function processOutbox(store: Store, push: PushClient, opts: { batchSize?: number } = {}): Promise<Summary> {
  const rows = await store.claim(opts.batchSize ?? 100);
  const summary: Summary = { claimed: rows.length, sent: 0, retry: 0, tokensRemoved: 0, requests: 0 };

  for (const group of chunks(rows)) {
    const messages: PushMessage[] = [];
    const owner: number[] = [];
    group.forEach((row, i) => {
      for (const m of messagesFor({ ...row, tokens: row.tokens.slice(0, MAX_PER_REQUEST) })) { messages.push(m); owner.push(i); }
    });

    summary.requests++;
    let tickets: Awaited<ReturnType<PushClient['send']>> | null = null;
    try {
      tickets = await push.send(messages);
    } catch {
      tickets = null; // the whole request failed: every row in it stays unsent and is retried after its lease
    }
    if (!tickets) { summary.retry += group.length; continue; }

    const ok = group.map(() => 0);
    const invalid = group.map(() => 0);
    const failed = group.map(() => 0);
    const dead = new Set<string>();
    tickets.forEach((t, k) => {
      const i = owner[k];
      if (t.status === 'ok') ok[i]++;
      else if (t.error === INVALID) { invalid[i]++; dead.add(messages[k].to); }
      else failed[i]++;
    });

    // Settled: at least one device got it (so a retry would send it twice), or every device is gone and
    // there is nobody left to send to. Anything else stays unsent.
    const settled: string[] = [];
    group.forEach((row, i) => {
      if (ok[i] > 0 || (failed[i] === 0 && invalid[i] > 0)) settled.push(row.log_id);
      else summary.retry++;
    });
    if (dead.size > 0) { await store.removeTokens([...dead]); summary.tokensRemoved += dead.size; }
    if (settled.length > 0) { await store.markSent(settled); summary.sent += settled.length; }
  }
  return summary;
}
