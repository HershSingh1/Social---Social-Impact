// The photo for a local spot: picked from the library only when the person taps (rule 6), re-encoded to JPEG (no
// metadata, no location) under the bucket's 1 MB limit, and uploaded to the public `listing-images` bucket under the
// person's own folder (G14). Returns the https link the submission carries. Never log the photo or its link (rule 8).
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { PhotoPermissionDenied } from '../auth/photo';

export { PhotoPermissionDenied };
export const LISTING_EDGE = 1600;
export const LISTING_MAX_BYTES = 1024 * 1024;

const base64Bytes = (value: string) => Math.ceil(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

export async function prepareListingPhoto(asset: { uri: string; width: number; height: number }) {
  if (asset.width <= 0 || asset.height <= 0) throw new Error('invalid_photo');
  const image = await ImageManipulator.manipulate(asset.uri, { maxWidth: LISTING_EDGE, maxHeight: LISTING_EDGE }).renderAsync();
  for (const compress of [0.85, 0.7, 0.55, 0.4, 0.3]) {
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (!result.base64 || base64Bytes(result.base64) <= LISTING_MAX_BYTES) return { uri: result.uri, width: result.width, height: result.height };
  }
  throw new Error('photo_too_large');
}

/** Picks, prepares and uploads one photo. Null when the picker is closed without choosing. */
export async function chooseListingPhoto(userId: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionDenied();
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: false, quality: 1 });
  if (picked.canceled || !picked.assets[0]) return null;
  const photo = await prepareListingPhoto(picked.assets[0]);
  const path = `${userId}/${randomUUID()}.jpg`;
  const bytes = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('listing-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
}
