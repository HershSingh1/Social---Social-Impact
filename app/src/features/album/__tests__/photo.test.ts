import { beforeEach, expect, jest, test } from '@jest/globals';
import { MAX_BYTES, MAX_EDGE, pickAlbumPhotos, PhotoPermissionDenied, prepareAlbumPhoto } from '../photo';

const mockManipulate = jest.fn();
const mockRender = jest.fn();
const mockSave = jest.fn<(options: Record<string, unknown>) => Promise<{ uri: string; width: number; height: number; base64?: string }>>();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
}));
const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
const mockLaunch = jest.fn<(options: Record<string, unknown>) => Promise<{ canceled: boolean; assets: { uri: string; width: number; height: number }[] }>>();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockPermission(),
  launchImageLibraryAsync: (options: Record<string, unknown>) => mockLaunch(options),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

// A phone photo as the picker returns it: HEIC, with GPS and camera data in its EXIF.
const gpsPhoto = { uri: 'file:///DCIM/IMG_0042.HEIC', width: 4032, height: 3024,
  exif: { GPSLatitude: 30.2672, GPSLongitude: -97.7431, GPSAltitude: 149, Make: 'Apple' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ uri: 'file:///cache/out.jpg', width: 2048, height: 1536, base64: 'AAAA' });
  mockRender.mockResolvedValue({ saveAsync: (o: Record<string, unknown>) => mockSave(o) } as never);
  mockManipulate.mockReturnValue({ renderAsync: mockRender });
  mockPermission.mockResolvedValue({ granted: true });
  mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.heic', width: 100, height: 100 }] });
});

test('a photo with GPS data is re-encoded to JPEG and what comes back carries no location data', async () => {
  const out = await prepareAlbumPhoto(gpsPhoto);
  // Every photo goes through the manipulator, even one that is already a JPEG, and it is saved as JPEG.
  expect(mockManipulate).toHaveBeenCalledWith('file:///DCIM/IMG_0042.HEIC', { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE });
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg' }));
  // The EXIF is never passed on: only the new file's address and size come back, and it is the saved file, not the original.
  expect(Object.keys(out).sort()).toEqual(['height', 'uri', 'width']);
  expect(out.uri).toBe('file:///cache/out.jpg');
  expect(JSON.stringify([out, mockSave.mock.calls])).not.toMatch(/GPS|Latitude|Longitude|Altitude|exif/i);
});

test('nothing is cropped, and a photo over the size limit is saved again at lower quality', async () => {
  const big = 'A'.repeat(Math.ceil((MAX_BYTES + 1000) * 4 / 3));
  mockSave.mockResolvedValueOnce({ uri: 'file:///big.jpg', width: 2048, height: 1536, base64: big })
    .mockResolvedValueOnce({ uri: 'file:///ok.jpg', width: 2048, height: 1536, base64: 'AAAA' });
  const out = await prepareAlbumPhoto(gpsPhoto);
  expect(out.uri).toBe('file:///ok.jpg');
  expect(mockSave.mock.calls.map(c => c[0].compress)).toEqual([0.9, 0.8]);
  expect(Object.keys(mockManipulate.mock.results[0].value as object)).toEqual(['renderAsync']);
});

test('a photo that never fits is refused, and an empty one is refused at once', async () => {
  mockSave.mockResolvedValue({ uri: 'file:///big.jpg', width: 1, height: 1, base64: 'A'.repeat(Math.ceil((MAX_BYTES + 1000) * 4 / 3)) });
  await expect(prepareAlbumPhoto(gpsPhoto)).rejects.toThrow('photo_too_large');
  await expect(prepareAlbumPhoto({ uri: 'x', width: 0, height: 10 })).rejects.toThrow('invalid_photo');
});

test('the picker is asked not to include metadata, and only as many photos as are left', async () => {
  const photos = await pickAlbumPhotos(5);
  expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ exif: false, allowsMultipleSelection: true, selectionLimit: 5 }));
  expect(photos).toEqual([{ uri: 'file:///a.heic', width: 100, height: 100 }]);
});

test('closing the picker adds nothing, and denied photo access is its own error', async () => {
  mockLaunch.mockResolvedValueOnce({ canceled: true, assets: [] });
  expect(await pickAlbumPhotos(5)).toEqual([]);
  mockPermission.mockResolvedValueOnce({ granted: false });
  await expect(pickAlbumPhotos(5)).rejects.toBeInstanceOf(PhotoPermissionDenied);
  expect(mockLaunch).toHaveBeenCalledTimes(1);
});
