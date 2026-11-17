import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Label, Sheet } from '../../ui';
import { color, minTap, radius, space } from '../../ui/theme';
import { PhotoPermissionDenied, pickProfilePhoto, type ImageResult } from './photo';

type Props = {
  name: string;
  uri?: string;
  canRemove?: boolean;
  onChoose: (photo: ImageResult) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
};

export function ProfilePhotoControl({ name, uri, canRemove = Boolean(uri), onChoose, onRemove }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState<'choose' | 'remove'>('choose');

  async function choose() {
    setBusy(true);
    setFailure(null);
    try {
      const photo = await pickProfilePhoto();
      if (!photo) return;
      await onChoose(photo);
      setVisible(false);
    } catch (error) {
      setRetry('choose');
      setFailure(error instanceof PhotoPermissionDenied
        ? 'Photo access is off. Your initials will stay here. Allow photo access in Settings, then try again.'
        : 'Couldn’t upload that photo. Your current photo is unchanged. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setFailure(null);
    try { await onRemove(); setVisible(false); }
    catch { setRetry('remove'); setFailure('Couldn’t remove your photo. It is still in place. Try again.'); }
    finally { setBusy(false); }
  }

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo"
      accessibilityHint="Choose a photo or remove the current one" onPress={() => { setFailure(null); setVisible(true); }}
      style={styles.control}>
      <Avatar name={name || '?'} uri={uri} size="xl" />
      <View style={styles.badge} accessible={false}>
        <Ionicons name="camera" size={16} color={color.onPrimary} />
      </View>
    </Pressable>
    <Sheet title="Profile photo" visible={visible} onClose={() => { if (!busy) setVisible(false); }}>
      <Button label="Choose from library" loading={busy} disabled={busy} onPress={choose} />
      {canRemove && <Button label="Remove photo" variant="secondary" disabled={busy} onPress={remove} />}
      {failure && <View style={styles.failure}>
        <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{failure}</Label>
        <Button label="Try again" variant="secondary" disabled={busy} onPress={retry === 'remove' ? remove : choose} />
      </View>}
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  control: { minWidth: minTap, minHeight: minTap, alignSelf: 'center' },
  badge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.primary, borderColor: color.bg, borderWidth: 2 },
  failure: { gap: space.sm },
});
