// TEC-139 (P2-02 backend, 3 of 3): authenticated album JPEG upload with server-side re-encoding.
// No photo bytes, paths, metadata values or storage errors are logged (rule 8).
import { createClient } from '@supabase/supabase-js';
import { initializeJpegCodec } from './codec.ts';
import { createAlbumPhotoHandler, type AlbumSession, type WriteResult } from './handler.ts';

const [decoder, encoder] = await Promise.all([
  Deno.readFile(new URL('./wasm/mozjpeg_dec.wasm', import.meta.url)),
  Deno.readFile(new URL('./wasm/mozjpeg_enc.wasm', import.meta.url)),
]);
await initializeJpegCodec(decoder, encoder);

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const storageAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createAlbumPhotoHandler({
  async authenticate(request): Promise<AlbumSession | null> {
    const authorization = request.headers.get('authorization');
    if (!authorization) return null;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    return {
      userId: data.user.id,
      async authorize(planId) {
        const { data: allowed, error: authorizationError } = await client.rpc('authorize_album_photo_upload', {
          target: planId,
        });
        if (authorizationError) throw new Error('authorization_unavailable');
        return allowed === true;
      },
      async read(path) {
        const { data: file } = await storageAdmin.storage.from('album').download(path);
        return file ? new Uint8Array(await file.arrayBuffer()) : null;
      },
      async write(path, bytes): Promise<WriteResult> {
        const { error: uploadError } = await storageAdmin.storage.from('album').upload(path, bytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });
        if (!uploadError) return 'created';
        const status = Number(uploadError.statusCode);
        if (status === 401 || status === 403) return 'denied';
        if (status === 409 || uploadError.message.toLowerCase().includes('already exists')) return 'exists';
        return 'failed';
      },
    };
  },
});

Deno.serve(handler);
