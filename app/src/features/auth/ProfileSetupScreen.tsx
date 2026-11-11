import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Label, Screen, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { saveProfile, validateProfile, type ProfileErrors, type ProfileInput } from './api';
import { useAuth } from './AuthProvider';

// Figma 1.3 Profile Setup (28:3089), cut to what PRO-9 F1 keeps: a name (required), city and age (optional).
// No username, and the photo comes in Phase 1b, so the avatar shows the initial only.
export function ProfileSetupScreen() {
  const { refresh } = useAuth();
  const [input, setInput] = useState<ProfileInput>({ name: '', city: '', age: '' });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const set = (key: keyof ProfileInput) => (value: string) => setInput(current => ({ ...current, [key]: value }));

  async function submit() {
    const found = validateProfile(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await saveProfile(input);
    await refresh();
  }

  return <Screen>
    <View style={styles.heading}>
      <Label accessibilityRole="header" style={type.title1}>Set up your profile</Label>
      <Label style={styles.secondary}>This is how friends and groups will see you.</Label>
    </View>
    <View style={styles.avatar}><Avatar name={input.name || '?'} size="xl" /></View>
    <TextField label="Name" value={input.name} onChangeText={set('name')} error={errors.name}
      autoCapitalize="words" autoComplete="name" textContentType="name" />
    <View style={styles.row}>
      <View style={styles.flex}>
        <TextField label="Age (optional)" value={input.age} onChangeText={set('age')} error={errors.age}
          keyboardType="number-pad" maxLength={3} />
      </View>
      <View style={styles.flex}>
        <TextField label="City (optional)" value={input.city} onChangeText={set('city')} error={errors.city}
          placeholder="Austin, TX" autoCapitalize="words" />
      </View>
    </View>
    <Label style={styles.caption}>Only your city is shared with groups, never your exact location.</Label>
    <View style={styles.footer}>
      <Button label="Continue" onPress={submit} errorMessage="Couldn’t save your profile. Check your connection and try again." />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: space.sm },
  secondary: { color: color.textSecondary },
  avatar: { alignItems: 'center' },
  // At 200% text the two fields stack instead of squeezing.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  flex: { flexGrow: 1, flexBasis: 140 },
  caption: { ...type.caption, color: color.textSecondary },
  footer: { marginTop: 'auto' },
});
