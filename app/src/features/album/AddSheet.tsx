// Frame board B: "Add to the album". The audience comes first, then photos and a note. Photos only from a tap (rule 6):
// denied leaves the note working.
import { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { Button, Label, Sheet, TextField } from '../../ui';
import { color, minTap, radius, space, type } from '../../ui/theme';
import { MAX_NOTE, MAX_PHOTOS, pickAlbumPhotos, PhotoPermissionDenied, type Picked } from './photo';

export type NewPost = { photos: Picked[]; note: string };

export function AddSheet({ visible, audience, have, onClose, onAdd }: {
  visible: boolean; audience: string; have: number; onClose: () => void; onAdd: (post: NewPost) => void | Promise<void>;
}) {
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [note, setNote] = useState('');
  const [denied, setDenied] = useState(false);
  const room = Math.max(0, MAX_PHOTOS - have - photos.length);
  const close = () => { setPhotos([]); setNote(''); setDenied(false); onClose(); };

  async function pick() {
    setDenied(false);
    try { const more = await pickAlbumPhotos(room); setPhotos(current => [...current, ...more].slice(0, MAX_PHOTOS - have)); }
    catch (error) { if (error instanceof PhotoPermissionDenied) { setDenied(true); return; } throw error; }
  }

  return <Sheet title="Add to the album" visible={visible} onClose={close}>
    <Label accessibilityRole="header" style={type.bodyStrong}>{audience}</Label>
    <View style={styles.tiles}>
      {photos.map(p => <Image key={p.uri} source={{ uri: p.uri }} style={styles.tile} accessibilityLabel="Photo to add" />)}
    </View>
    <Button label={photos.length ? 'Add more photos' : 'Choose photos'} variant="secondary" disabled={room === 0}
      errorMessage="Couldn’t open your photos. Try again." onPress={pick} />
    <Label style={styles.muted}>{photos.length + have} of {MAX_PHOTOS} photos. JPEG, PNG, HEIC or WebP, up to 15 MB each.</Label>
    {denied && <>
      <Label accessibilityRole="alert" style={styles.warn}>Photos are off for Sidequest. Turn them on in iPhone Settings. You can still add a note.</Label>
      <Button label="Open iPhone Settings" variant="text" onPress={async () => { await Linking.openSettings(); }} />
    </>}
    <TextField label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={MAX_NOTE} style={styles.note} />
    <Label style={styles.count}>{note.length} of {MAX_NOTE}</Label>
    <Label style={styles.muted}>Location data is removed from your photos before they upload.</Label>
    <Button label="Add to album" disabled={photos.length === 0 && note.trim().length === 0}
      errorMessage="Couldn’t add that. Try again." onPress={async () => { await onAdd({ photos, note: note.trim() }); close(); }} />
  </Sheet>;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: color.surface },
  muted: { color: color.textSecondary },
  count: { ...type.caption, color: color.textSecondary, textAlign: 'right' },
  note: { minHeight: minTap + 32, textAlignVertical: 'top' },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: 8 },
});
