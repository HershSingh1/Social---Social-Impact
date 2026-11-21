// Reads go through RLS (`album_items`); every write is an RPC. Photos live in the private `album` bucket and are
// shown through short-lived signed URLs; the upload goes through the `album-photo` Edge Function (N12).
import { randomUUID } from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { prepareAlbumPhoto } from './photo';

export type AlbumItem = {
  id: string; userId: string; kind: 'photo' | 'note'; note: string | null; audience: 'plan' | 'group'; createdAt: string;
  /** A signed link for a photo, valid for a few minutes. Never stored or logged. */
  url: string | null;
};
export const albumKey = (planId: string) => ['album', planId] as const;
const SIGNED_SECONDS = 300;

type Row = { id: string; user_id: string; kind: 'photo' | 'note'; storage_path: string | null; audience: 'plan' | 'group'; note: string | null; created_at: string };

export async function fetchAlbum(planId: string): Promise<AlbumItem[]> {
  const { data, error } = await supabase.from('album_items')
    .select('id, user_id, kind, storage_path, audience, note, created_at').eq('plan_id', planId).order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const paths = rows.flatMap(r => r.storage_path ? [r.storage_path] : []);
  const urls = new Map<string, string>();
  if (paths.length) {
    const signed = await supabase.storage.from('album').createSignedUrls(paths, SIGNED_SECONDS);
    if (signed.error) throw signed.error;
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map(r => ({ id: r.id, userId: r.user_id, kind: r.kind, note: r.note, audience: r.audience, createdAt: r.created_at,
    url: r.storage_path ? urls.get(r.storage_path) ?? null : null }));
}

/** Sends one prepared JPEG to the server, which re-encodes it and stores it. Returns its path. Safe to repeat with the same key. */
export async function uploadPhoto(planId: string, clientKey: string, jpegUri: string): Promise<string> {
  const form = new FormData();
  form.append('plan_id', planId);
  form.append('client_key', clientKey);
  form.append('file', { uri: jpegUri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  const { data, error } = await supabase.functions.invoke('album-photo', { body: form });
  if (error) throw error;
  const path = (data as { path?: string } | null)?.path;
  if (!path) throw new Error('upload_failed');
  return path;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}
export const addNote = (planId: string, clientKey: string, note: string) =>
  rpc('add_album_item', { client_key: clientKey, plan_id: planId, kind: 'note', storage_path: null, note });
export const shareItem = (id: string) => rpc('share_album_item', { id });
export const deleteItem = (id: string) => rpc('delete_album_item', { id });
export const reportItem = (id: string) => rpc('report_album_item', { id });

/** One photo, start to finish: re-encode on the phone, upload, then post. The same client key makes every retry safe. */
export async function postPhoto(planId: string, clientKey: string, sourceUri: string, width: number, height: number): Promise<void> {
  const prepared = await prepareAlbumPhoto({ uri: sourceUri, width, height });
  const path = await uploadPhoto(planId, clientKey, prepared.uri);
  await rpc('add_album_item', { client_key: clientKey, plan_id: planId, kind: 'photo', storage_path: path, note: null });
}

export const newKey = () => randomUUID();

const MESSAGES: Record<string, string> = {
  not_attended: 'Only people who said they went can add to this album.',
  photo_limit: 'You’ve added 20 photos to this plan, the most allowed. Delete one to add another.',
  no_group: 'This plan isn’t in a group, so there is no group to share with.',
  not_found: 'That item isn’t there any more.',
  own_item: 'You can’t report your own item. You can delete it instead.',
};
/** Text for under a button when a write fails. */
export function albumError(error: unknown, fallback: string): string {
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  const known = Object.keys(MESSAGES).find(code => message.includes(code));
  return known ? MESSAGES[known] : fallback;
}
