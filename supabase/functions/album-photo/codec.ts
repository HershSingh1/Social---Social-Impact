import decode, { init as initDecode } from '@jsquash/jpeg/decode.js';
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';

export const MAX_JPEG_BYTES = 15 * 1024 * 1024;
export const MAX_JPEG_PIXELS = 24_000_000;

export type JpegErrorCode =
  | 'codec_not_initialized'
  | 'encoded_too_large'
  | 'file_too_large'
  | 'image_too_large'
  | 'invalid_jpeg';

export class JpegError extends Error {
  readonly code: JpegErrorCode;

  constructor(code: JpegErrorCode) {
    super(code);
    this.code = code;
  }
}

type WasmInitializer = (module: WebAssembly.Module) => Promise<void>;
let initialization: Promise<void> | undefined;

const exactBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export function initializeJpegCodec(decoder: Uint8Array, encoder: Uint8Array): Promise<void> {
  if (!initialization) {
    initialization = Promise.all([
      WebAssembly.compile(exactBuffer(decoder)),
      WebAssembly.compile(exactBuffer(encoder)),
    ]).then(async ([decoderModule, encoderModule]) => {
      await Promise.all([
        (initDecode as unknown as WasmInitializer)(decoderModule),
        (initEncode as unknown as WasmInitializer)(encoderModule),
      ]);
    });
  }
  return initialization;
}

const isStartOfFrame = (marker: number) =>
  (marker >= 0xc0 && marker <= 0xc3) ||
  (marker >= 0xc5 && marker <= 0xc7) ||
  (marker >= 0xc9 && marker <= 0xcb) ||
  (marker >= 0xcd && marker <= 0xcf);

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new JpegError('invalid_jpeg');

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new JpegError('invalid_jpeg');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) throw new JpegError('invalid_jpeg');

    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new JpegError('invalid_jpeg');
    if (isStartOfFrame(marker)) {
      if (length < 8) throw new JpegError('invalid_jpeg');
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width < 1 || height < 1) throw new JpegError('invalid_jpeg');
      return { width, height };
    }
    offset += length;
  }
  throw new JpegError('invalid_jpeg');
}

export async function reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  if (!initialization) throw new JpegError('codec_not_initialized');
  await initialization;
  if (bytes.length > MAX_JPEG_BYTES) throw new JpegError('file_too_large');

  const { width, height } = jpegDimensions(bytes);
  if (width * height > MAX_JPEG_PIXELS) throw new JpegError('image_too_large');

  try {
    // Orientation is applied to the pixels. The encoder receives only pixels, so EXIF, GPS and every other
    // metadata block are absent from the stored JPEG.
    const pixels = await decode(exactBuffer(bytes), { preserveOrientation: true });
    const output = new Uint8Array(await encode(pixels, { quality: 90, progressive: true }));
    if (output.length > MAX_JPEG_BYTES) throw new JpegError('encoded_too_large');
    return output;
  } catch (error) {
    if (error instanceof JpegError) throw error;
    throw new JpegError('invalid_jpeg');
  }
}
