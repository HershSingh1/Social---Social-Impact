import { beforeEach, expect, jest, test } from '@jest/globals';
import { prepareProfilePhoto, squareCrop } from '../photo';

const mockCrop = jest.fn();
const mockResize = jest.fn();
const mockRender = jest.fn();
const mockSave = jest.fn();
const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'photo-id' }));
jest.mock('../../../lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCrop.mockReturnThis();
  mockResize.mockReturnThis();
  mockSave.mockResolvedValue({ uri: 'file:///profile.jpg', width: 1024, height: 1024 } as never);
  mockRender.mockResolvedValue({ saveAsync: mockSave } as never);
  mockManipulate.mockReturnValue({ crop: mockCrop, resize: mockResize, renderAsync: mockRender });
});

test('squareCrop centers landscape and portrait photos', () => {
  expect(squareCrop(1600, 1200)).toEqual({ originX: 200, originY: 0, width: 1200, height: 1200 });
  expect(squareCrop(900, 1500)).toEqual({ originX: 0, originY: 300, width: 900, height: 900 });
});

test('prepareProfilePhoto crops after safe decoding, limits the edge, and always writes JPEG', async () => {
  await prepareProfilePhoto({ uri: 'file:///large.heic', width: 4000, height: 3000 });
  expect(mockManipulate).toHaveBeenCalledWith('file:///large.heic', { maxWidth: 2048, maxHeight: 2048 });
  expect(mockCrop).toHaveBeenCalledWith({ originX: 256, originY: 0, width: 1536, height: 1536 });
  expect(mockResize).toHaveBeenCalledWith({ width: 1024, height: 1024 });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.82, base64: true });
});
