import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Button, Notice, Screen, Text, TextField } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { messageForError } from '@/shared/lib/errors';
import { validateGroupName } from '@/shared/lib/validation';
import { useAuth } from '@/features/auth/AuthProvider';
import { createGroup } from './api';

export function CreateGroupScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAccount, userId } = useAuth();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit() {
    setFailure(null);
    const v = validateGroupName(name);
    if (!v.ok) { setFieldError(v.error); return; }
    setFieldError(null);
    try {
      const result = await createGroup(v.value);
      await qc.invalidateQueries({ queryKey: ['groups', userId] });
      router.replace(href(`/group/${result.group_id}`)); // the group page shows the join code
    } catch (e) {
      // typed name stays in the field; the message says what went wrong
      setFailure(messageForError(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        <Text muted>For people you already make plans with. You'll get a join code to share.</Text>
        {!isAccount ? <Notice tone="error" title="Sign in to create a group." /> : null}
        <TextField
          label="Group name"
          value={name}
          onChangeText={(t) => { setName(t); if (fieldError) setFieldError(null); }}
          placeholder="Saturday crew"
          maxLength={60}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
          error={fieldError}
          hint="Up to 50 characters."
        />
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <Button label="Create and get a join code" onPress={submit} disabled={!isAccount} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
