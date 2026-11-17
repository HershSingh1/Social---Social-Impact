// Figma: 28:3089 1.3 Profile Setup (file MkYNxuYFuktTR0yGExJnK7)
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Label, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { saveProfile, usernameErrorFrom, validateProfile, type ProfileErrors, type ProfileInput } from './api';
import { OnboardingFrame } from './OnboardingFrame';

type Props = { initial: ProfileInput; onBack: () => void; onSaved: (saved: ProfileInput) => Promise<void> };

// The photo badge on the avatar comes with avatar upload, so the avatar shows the initial only (TEC-117 out of scope).
export function ProfileStep({ initial, onBack, onSaved }: Props) {
  const [input, setInput] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const set = (key: keyof ProfileInput) => (value: string) => setInput(current => ({ ...current, [key]: value }));

  async function submit() {
    const found = validateProfile(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try { await saveProfile(input); }
    catch (error) {
      const taken = usernameErrorFrom(error);
      if (!taken) throw error; // the button shows "couldn’t save" and everything typed stays
      setErrors({ username: taken });
      return;
    }
    await onSaved(input);
  }

  return <OnboardingFrame step={1} title="Set up your profile" subtitle="This is how friends and groups will see you."
    onBack={onBack} backLabel="Back to sign in"
    footer={<Button label="Continue" onPress={submit} errorMessage="Couldn’t save your profile. Check your connection and try again." />}>
    <View style={styles.avatar}><Avatar name={input.name || '?'} size="xl" /></View>
    <TextField label="Full name" value={input.name} onChangeText={set('name')} error={errors.name}
      autoCapitalize="words" autoComplete="name" textContentType="name" />
    <TextField label="Username" value={input.username} onChangeText={set('username')} error={errors.username}
      placeholder="@username" autoCapitalize="none" autoCorrect={false} autoComplete="username-new" textContentType="username" maxLength={21} />
    <View style={styles.row}>
      <View style={styles.flex}>
        <TextField label="Age" value={input.age} onChangeText={set('age')} error={errors.age} keyboardType="number-pad" maxLength={3} />
      </View>
      <View style={styles.flex}>
        <TextField label="City" value={input.city} onChangeText={set('city')} error={errors.city} placeholder="Austin, TX" autoCapitalize="words" />
      </View>
    </View>
    <Label style={styles.caption}>Only your city is shared with groups — never your exact location.</Label>
  </OnboardingFrame>;
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center' },
  // At 200% text the two fields stack instead of squeezing.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  flex: { flexGrow: 1, flexBasis: 140 },
  caption: { ...type.caption, color: color.textSecondary },
});
