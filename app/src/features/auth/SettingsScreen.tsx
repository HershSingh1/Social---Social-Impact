// Figma: 4046:3937 PRO-16 Settings, Delete account · confirm sheet (file MkYNxuYFuktTR0yGExJnK7; see docs/figma-frames.md).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { avatarUrl } from '../../lib/avatar';
import { Button, Card, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { deleteAccount, loadOwnProfile, saveAvatarPath, signOut, type OwnProfile } from './api';
import { BudgetOptIn } from '../budget/BudgetOptIn';
import { ProfilePhotoControl } from './ProfilePhotoControl';
import { deleteProfilePhoto, uploadProfilePhoto, type ImageResult } from './photo';

export const ownProfileKey = ['own-profile'] as const;

export function SettingsScreen() {
  const [confirming, setConfirming] = useState(false);
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ownProfileKey, queryFn: loadOwnProfile });

  async function replacePhoto(current: OwnProfile, photo: ImageResult) {
    const nextPath = await uploadProfilePhoto(current.userId, photo.uri);
    try { await saveAvatarPath(current, nextPath); }
    catch (error) { await deleteProfilePhoto(nextPath).catch(() => {}); throw error; }
    client.setQueryData<OwnProfile>(ownProfileKey, { ...current, avatarPath: nextPath });
    await deleteProfilePhoto(current.avatarPath).catch(() => {});
  }

  async function removePhoto(current: OwnProfile) {
    await saveAvatarPath(current, null);
    try { await deleteProfilePhoto(current.avatarPath); }
    catch (error) {
      await saveAvatarPath(current, current.avatarPath).catch(() => {});
      throw error;
    }
    client.setQueryData<OwnProfile>(ownProfileKey, { ...current, avatarPath: null });
  }

  if (confirming) return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Delete your account?</Label>
    <Card>
      <View style={styles.copy}>
        <Label style={type.headline}>This can’t be undone</Label>
        <Label>We’ll delete your profile, saves, votes, responses, and group memberships.</Label>
        <Label>Plans you organized will be cancelled. Groups you own will transfer to another member, or be archived if nobody else is in them.</Label>
      </View>
    </Card>
    <Button label="Delete my account" errorMessage="Couldn’t delete your account. Nothing was changed—try again."
      onPress={deleteAccount} />
    <Button label="Keep my account" variant="secondary" onPress={() => setConfirming(false)} />
  </Screen>;

  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Settings</Label>
    <Card><View style={styles.photo}>
      <Label style={type.headline}>Profile photo</Label>
      {profile.isPending ? <Loading label="Loading your profile…" />
        : profile.data ? <>
          <ProfilePhotoControl name={profile.data.name} uri={avatarUrl(profile.data.avatarPath)}
            canRemove={Boolean(profile.data.avatarPath)} onChoose={photo => replacePhoto(profile.data!, photo)}
            onRemove={() => removePhoto(profile.data!)} />
          <Label style={styles.muted}>Friends and people in your plans will see this photo.</Label>
        </>
        : <ErrorState message="Couldn’t load your profile photo." onRetry={async () => { await profile.refetch(); }} />}
    </View></Card>
    {profile.data && <BudgetOptIn userId={profile.data.userId} />}
    <Card><View style={styles.copy}>
      <Label style={type.headline}>Activity quiz</Label>
      <Label style={styles.muted}>Tell us what you’re into and Discover lists matches first. Only you see your answers.</Label>
      <Button label="Take the quiz" variant="secondary" onPress={() => router.push('/quiz' as never)} />
    </View></Card>
    <Card><View style={styles.copy}>
      <Label style={type.headline}>Account</Label>
      <Label style={styles.muted}>Signing out keeps your account and everything in it.</Label>
      <Button label="Sign out" variant="secondary" errorMessage="Couldn’t sign out. Try again." onPress={signOut} />
    </View></Card>
    <Card><View style={styles.copy}>
      <Label style={type.headline}>Delete account</Label>
      <Label style={styles.muted}>Permanently remove your account and personal data.</Label>
      <Button label="Delete account" variant="text" onPress={() => setConfirming(true)} />
    </View></Card>
  </Screen>;
}

const styles = StyleSheet.create({
  copy: { gap: space.sm },
  photo: { gap: space.sm, alignItems: 'center' },
  muted: { color: color.textSecondary },
});
