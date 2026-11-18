import { JpegError, MAX_JPEG_BYTES, reencodeJpeg } from './codec.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = MAX_JPEG_BYTES + 1024 * 1024;

export type WriteResult = 'created' | 'denied' | 'exists' | 'failed';
export type AlbumSession = {
  userId: string;
  authorize(planId: string): Promise<boolean>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<WriteResult>;
};
export type AlbumPhotoDependencies = {
  authenticate(request: Request): Promise<AlbumSession | null>;
  reencode?(bytes: Uint8Array): Promise<Uint8Array>;
};

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sameBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
};

function jpegFailure(error: unknown): Response | null {
  if (!(error instanceof JpegError)) return null;
  if (error.code === 'file_too_large' || error.code === 'encoded_too_large') {
    return response(413, { error: error.code });
  }
  if (error.code === 'invalid_jpeg' || error.code === 'image_too_large') {
    return response(400, { error: error.code });
  }
  return response(500, { error: 'not_configured' });
}

export function createAlbumPhotoHandler(dependencies: AlbumPhotoDependencies) {
  const sanitize = dependencies.reencode ?? reencodeJpeg;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });

    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return response(413, { error: 'file_too_large' });
    }

    let session: AlbumSession | null;
    try {
      session = await dependencies.authenticate(request);
    } catch {
      return response(503, { error: 'auth_unavailable' });
    }
    if (!session) return response(401, { error: 'unauthorized' });

    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return response(415, { error: 'multipart_required' });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return response(400, { error: 'invalid_form' });
    }

    const planId = form.get('plan_id');
    const clientKey = form.get('client_key');
    const file = form.get('file');
    if (typeof planId !== 'string' || !UUID.test(planId)) return response(400, { error: 'invalid_plan_id' });
    if (typeof clientKey !== 'string' || !UUID.test(clientKey)) return response(400, { error: 'invalid_client_key' });
    if (!(file instanceof Blob)) return response(400, { error: 'file_required' });
    if (file.type !== 'image/jpeg') return response(415, { error: 'jpeg_required' });
    if (file.size > MAX_JPEG_BYTES) return response(413, { error: 'file_too_large' });

    try {
      if (!(await session.authorize(planId))) return response(403, { error: 'upload_not_allowed' });
    } catch {
      return response(503, { error: 'authorization_unavailable' });
    }

    const path = `${planId.toLowerCase()}/${session.userId.toLowerCase()}/${clientKey.toLowerCase()}.jpg`;
    let sanitized: Uint8Array;
    try {
      sanitized = await sanitize(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      return jpegFailure(error) ?? response(500, { error: 'processing_failed' });
    }

    try {
      const prior = await session.read(path);
      if (prior) {
        return sameBytes(prior, sanitized)
          ? response(200, { path, reused: true })
          : response(409, { error: 'request_conflict' });
      }

      const written = await session.write(path, sanitized);
      if (written === 'created') return response(201, { path, reused: false });
      if (written === 'denied') return response(403, { error: 'upload_not_allowed' });
      if (written === 'failed') return response(503, { error: 'storage_unavailable' });

      // Another retry may have won the upload race. It is a successful retry only when its bytes match.
      const raced = await session.read(path);
      return raced && sameBytes(raced, sanitized)
        ? response(200, { path, reused: true })
        : response(409, { error: 'request_conflict' });
    } catch {
      return response(503, { error: 'storage_unavailable' });
    }
  };
}
