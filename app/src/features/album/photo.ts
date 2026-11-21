// Picking and preparing album photos. Every photo is re-encoded to JPEG on the phone, which drops the original
// metadata (location included), and kept inside the 15 MB limit. Nothing is cropped. The server re-encodes again
// (N12) and is the real guarantee; this keeps location data off the wire. Never log photos or paths (rule 8).
import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { PhotoPermissionDenied } from '../auth/photo';

export { PhotoPermissionDenied };
export const MAX_PHOTOS = 20;
export const MAX_NOTE = 500;
export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 2048;

const base64Bytes = (value: string) => Math.ceil(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

export type Picked = Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>;

/** A JPEG with no metadata and at most MAX_BYTES. Throws `photo_too_large` if no quality gets it under the limit. */
export async function prepareAlbumPhoto(asset: Picked): Promise<ImageResult> {
  if (asset.width <= 0 || asset.height <= 0) throw new Error('invalid_photo');
  const image = await ImageManipulator.manipulate(asset.uri, { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE }).renderAsync();
  for (const compress of [0.9, 0.8, 0.65, 0.5, 0.35]) {
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (!result.base64 || base64Bytes(result.base64) <= MAX_BYTES) return { uri: result.uri, width: result.width, height: result.height };
  }
  throw new Error('photo_too_large');
}

/** Asks for the photo library only now, when the person tapped. Returns [] when the picker is closed with nothing chosen. */
export async function pickAlbumPhotos(room: number): Promise<Picked[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionDenied();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, room), exif: false, quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, room).map(a => ({ uri: a.uri, width: a.width, height: a.height }));
}
