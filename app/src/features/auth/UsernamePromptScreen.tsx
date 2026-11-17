import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Label, Screen, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { cleanUsername, saveUsername, usernameErrorFrom, validateUsername } from './api';
import { useAuth } from './AuthProvider';

// Shown once to people who set up a profile before usernames existed. It is a prompt, not a gate: Not now closes it
// and everything keeps working. There is no Figma frame for it, so it reuses the 1.3 field and button as they are.
export function UsernamePromptScreen() {
  const { session, refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string>();

  async function save() {
    const invalid = validateUsername(username);
    setError(invalid);
    if (invalid || !session) return;
    try { await saveUsername(session.user.id, cleanUsername(username)); }
    catch (failure) {
      const taken = usernameErrorFrom(failure);
      if (!taken) throw failure;
      setError(taken);
      return;
    }
    await refresh();
    router.back();
  }

  return <Screen tinted footer={<View style={styles.footer}>
    <Button label="Save username" onPress={save} errorMessage="Couldn’t save your username. Check your connection and try again." />
    <Button label="Not now" variant="text" onPress={() => router.back()} />
  </View>}>
    <Label accessibilityRole="header" style={type.title1}>Pick a username</Label>
    <Label style={styles.secondary}>Friends can find you by it. You can do this later too.</Label>
    <TextField label="Username" value={username} onChangeText={setUsername} error={error} placeholder="@username"
      autoCapitalize="none" autoCorrect={false} autoComplete="username-new" textContentType="username" maxLength={21} />
  </Screen>;
}

const styles = StyleSheet.create({
  secondary: { color: color.textSecondary },
  footer: { gap: space.xs },
});
