import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, test } from 'node:test';
import encode from '@jsquash/jpeg/encode.js';
import {
  initializeJpegCodec,
  jpegDimensions,
  reencodeJpeg,
} from './codec.ts';
import {
  createAlbumPhotoHandler,
  type AlbumPhotoDependencies,
  type AlbumSession,
  type WriteResult,
} from './handler.ts';

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_KEY = '33333333-3333-4333-8333-333333333333';

before(async () => {
  const [decoder, encoder] = await Promise.all([
    readFile(new URL('./wasm/mozjpeg_dec.wasm', import.meta.url)),
    readFile(new URL('./wasm/mozjpeg_enc.wasm', import.meta.url)),
  ]);
  await initializeJpegCodec(decoder, encoder);
});

async function jpeg(red: number, green: number, blue: number) {
  const data = new Uint8ClampedArray([
    red, green, blue, 255,
    red, green, blue, 255,
    red, green, blue, 255,
    red, green, blue, 255,
  ]);
  return new Uint8Array(await encode({ data, width: 2, height: 2 } as ImageData, { quality: 90 }));
}

function gpsExifSegment() {
  // A little-endian TIFF IFD with GPSInfo (0x8825) pointing to GPSLatitudeRef = "N".
  const tiff = new Uint8Array(44);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8825, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 1, true);
  view.setUint16(30, 2, true);
  view.setUint32(32, 2, true);
  tiff.set([0x4e, 0, 0, 0], 36);
  view.setUint32(40, 0, true);

  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  payload.set(tiff, 6);
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

function withGpsExif(source: Uint8Array) {
  const segment = gpsExifSegment();
  const result = new Uint8Array(source.length + segment.length);
  result.set(source.subarray(0, 2));
  result.set(segment, 2);
  result.set(source.subarray(2), 2 + segment.length);
  return result;
}

function containsExif(bytes: Uint8Array) {
  const marker = [0x45, 0x78, 0x69, 0x66, 0, 0];
  return bytes.some((_, offset) => marker.every((value, i) => bytes[offset + i] === value));
}

function uploadRequest(file: Uint8Array, overrides: { clientKey?: string; type?: string } = {}) {
  const form = new FormData();
  form.set('plan_id', PLAN_ID);
  form.set('client_key', overrides.clientKey ?? CLIENT_KEY);
  form.set('file', new Blob([file], { type: overrides.type ?? 'image/jpeg' }), 'album.jpg');
  return new Request('https://example.test/functions/v1/album-photo', { method: 'POST', body: form });
}

function memoryDependencies(writeResult: WriteResult = 'created') {
  const files = new Map<string, Uint8Array>();
  const session: AlbumSession = {
    userId: USER_ID,
    async authorize() { return true; },
    async read(path) { return files.get(path) ?? null; },
    async write(path, bytes) {
      if (writeResult !== 'created') return writeResult;
      files.set(path, bytes);
      return 'created';
    },
  };
  const dependencies: AlbumPhotoDependencies = { async authenticate() { return session; } };
  return { dependencies, files };
}

test('a JPEG with GPS EXIF is decoded and stored as a metadata-free JPEG', async () => {
  const input = withGpsExif(await jpeg(180, 30, 20));
  assert.ok(containsExif(input));
  assert.deepEqual(jpegDimensions(input), { width: 2, height: 2 });

  const output = await reencodeJpeg(input);
  assert.ok(!containsExif(output));
  assert.deepEqual(jpegDimensions(output), { width: 2, height: 2 });
  assert.notDeepEqual(output, input);
});

test('the endpoint re-encodes, stores under the caller, and makes a retry idempotent', async () => {
  const input = withGpsExif(await jpeg(30, 140, 220));
  const { dependencies, files } = memoryDependencies();
  const handler = createAlbumPhotoHandler(dependencies);

  const first = await handler(uploadRequest(input));
  assert.equal(first.status, 201);
  const body = await first.json();
  const expected = `${PLAN_ID}/${USER_ID}/${CLIENT_KEY}.jpg`;
  assert.deepEqual(body, { path: expected, reused: false });
  assert.ok(!containsExif(files.get(expected)!));

  const retry = await handler(uploadRequest(input));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { path: expected, reused: true });
  assert.equal(files.size, 1);
});

test('reusing a client key for another photo is a conflict', async () => {
  const { dependencies } = memoryDependencies();
  const handler = createAlbumPhotoHandler(dependencies);
  assert.equal((await handler(uploadRequest(await jpeg(255, 0, 0)))).status, 201);
  const conflict = await handler(uploadRequest(await jpeg(0, 0, 255)));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'request_conflict' });
});

test('authentication, type, image and storage failures use stable errors', async () => {
  const photo = await jpeg(20, 20, 20);
  const unauthorized = createAlbumPhotoHandler({ async authenticate() { return null; } });
  assert.equal((await unauthorized(uploadRequest(photo))).status, 401);

  const { dependencies } = memoryDependencies();
  const handler = createAlbumPhotoHandler(dependencies);
  assert.equal((await handler(uploadRequest(photo, { type: 'image/png' }))).status, 415);
  const invalid = await handler(uploadRequest(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'invalid_jpeg' });

  const deniedSession: AlbumSession = {
    userId: USER_ID,
    async authorize() { return false; },
    async read() { throw new Error('storage must not be read'); },
    async write() { throw new Error('storage must not be written'); },
  };
  const denied = createAlbumPhotoHandler({ async authenticate() { return deniedSession; } });
  const deniedResponse = await denied(uploadRequest(photo));
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(await deniedResponse.json(), { error: 'upload_not_allowed' });
});

test('a concurrent identical upload is accepted, but different bytes conflict', async () => {
  const photo = await jpeg(80, 90, 100);
  const stored = await reencodeJpeg(photo);
  let reads = 0;
  const session: AlbumSession = {
    userId: USER_ID,
    async authorize() { return true; },
    async read() { return reads++ === 0 ? null : stored; },
    async write() { return 'exists'; },
  };
  const handler = createAlbumPhotoHandler({ async authenticate() { return session; } });
  assert.equal((await handler(uploadRequest(photo))).status, 200);

  const otherSession: AlbumSession = { ...session, async read() { return reads++ === 0 ? null : new Uint8Array([1]); } };
  reads = 0;
  const other = createAlbumPhotoHandler({ async authenticate() { return otherSession; } });
  assert.equal((await other(uploadRequest(photo))).status, 409);
});
