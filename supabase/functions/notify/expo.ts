// Expo push service client. The only place that talks to Expo; tests replace it with a fake.
import type { PushMessage } from './messages.ts';

export type Ticket = { status: 'ok' } | { status: 'error'; error: string };

// Sends up to 100 messages and returns one ticket per message, in order. Throws when the request as a whole
// failed (network, HTTP error, odd response), which means nothing in it should be treated as delivered.
// Errors carry a short code only: never a token, a body or a response body (rule 8).
export type PushClient = { send(messages: PushMessage[]): Promise<Ticket[]> };

export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const MAX_PER_REQUEST = 100;

export function expoClient(opts: { fetch?: typeof fetch; accessToken?: string; url?: string } = {}): PushClient {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(messages) {
      if (messages.length === 0) return [];
      if (messages.length > MAX_PER_REQUEST) throw new Error('expo_batch_too_large');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
      const res = await doFetch(opts.url ?? EXPO_SEND_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
      if (!res.ok) throw new Error(`expo_http_${res.status}`);
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (!Array.isArray(data) || data.length !== messages.length) throw new Error('expo_bad_response');
      return data.map((t: { status?: string; details?: { error?: string } }): Ticket =>
        t?.status === 'ok' ? { status: 'ok' } : { status: 'error', error: t?.details?.error ?? 'unknown' });
    },
  };
}
