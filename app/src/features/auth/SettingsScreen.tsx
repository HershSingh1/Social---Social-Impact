import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Label, Screen } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { deleteAccount, signOut } from './api';

export function SettingsScreen() {
  const [confirming, setConfirming] = useState(false);

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
  muted: { color: color.textSecondary },
});
