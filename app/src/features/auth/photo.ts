import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

export type { ImageResult } from 'expo-image-manipulator';

export const PHOTO_EDGE = 1024;
const DECODE_EDGE = 2048;
const MAX_BYTES = 1024 * 1024;

export class PhotoPermissionDenied extends Error {}

export type Crop = { originX: number; originY: number; width: number; height: number };

export function squareCrop(width: number, height: number): Crop {
  const edge = Math.min(width, height);
  return {
    originX: Math.round((width - edge) / 2),
    originY: Math.round((height - edge) / 2),
    width: edge,
    height: edge,
  };
}

function base64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.ceil(value.length * 3 / 4) - padding;
}

function decodedSize(width: number, height: number) {
  const scale = Math.min(1, DECODE_EDGE / width, DECODE_EDGE / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Cropping and JPEG re-encoding also discard the original photo metadata. */
export async function prepareProfilePhoto(asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>): Promise<ImageResult> {
  if (asset.width <= 0 || asset.height <= 0) throw new Error('invalid_photo');
  const loaded = decodedSize(asset.width, asset.height);
  const crop = squareCrop(loaded.width, loaded.height);
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: DECODE_EDGE, maxHeight: DECODE_EDGE }).crop(crop);
  if (crop.width > PHOTO_EDGE) context.resize({ width: PHOTO_EDGE, height: PHOTO_EDGE });
  const image = await context.renderAsync();
  for (const compress of [0.82, 0.68, 0.5, 0.35]) {
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (!result.base64 || base64Bytes(result.base64) <= MAX_BYTES) {
      return { uri: result.uri, width: result.width, height: result.height };
    }
  }
  throw new Error('photo_too_large');
}

/** Returns null when the person closes the picker without choosing anything. */
export async function pickProfilePhoto(): Promise<ImageResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionDenied();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return prepareProfilePhoto(result.assets[0]);
}

export async function uploadProfilePhoto(userId: string, uri: string): Promise<string> {
  const path = `${userId}/${randomUUID()}.jpg`;
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deleteProfilePhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from('avatars').remove([path]);
  if (error) throw error;
}
