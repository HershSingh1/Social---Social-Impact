import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Screen, Text, TextField, radius, space, useColors } from '@/shared/ui';
import { href, signInHref } from '@/shared/lib/nav';
import { messageForCode, messageForError } from '@/shared/lib/errors';
import { validateDisplayName } from '@/shared/lib/validation';
import { useAuth } from '@/features/auth/AuthProvider';
import { setProfile } from '@/features/auth/api';
import type { PreviewResult } from '@/types/database';
import { joinGroup, previewCode } from './api';
import { CODE_LENGTH, isCompleteCode, normalizeCode, spellCode } from './codes';

type Preview = Extract<PreviewResult, { ok: true }>;

/**
 * P0-01: enter a code (or arrive from sidequest://join/CODE), see who invited you, continue as a guest with a
 * display name or sign in, then join. Opening a link alone never adds anyone: only "Join group" does.
 */
export function JoinFlow({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const c = useColors();
  const { isAccount, profile, userId } = useAuth();

  const [code, setCode] = useState(normalizeCode(initialCode ?? ''));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const nameTouched = useRef(false);

  // prefill the name for a returning guest or a signed-in person, unless they started typing
  useEffect(() => {
    if (!nameTouched.current && profile?.display_name) setName(profile.display_name);
  }, [profile?.display_name]);

  async function checkCode(value = code) {
    setFailure(null);
    if (!isCompleteCode(value)) {
      setCodeError(`Codes have ${CODE_LENGTH} characters.`);
      return;
    }
    try {
      const res = await previewCode(normalizeCode(value));
      if (!res.ok) { setCodeError(messageForCode(res.error)); return; } // typed code stays in the field
      setCodeError(null);
      setPreview(res);
    } catch (e) {
      setCodeError(messageForError(e));
    }
  }

  // a link like sidequest://join/SQ7K2M goes straight to the preview
  const auto = useRef(false);
  useEffect(() => {
    if (!auto.current && userId && initialCode && isCompleteCode(initialCode)) {
      auto.current = true;
      void checkCode(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function join() {
    if (!preview) return;
    setFailure(null);
    setNameError(null);

    if (preview.already_member) { router.replace(href(`/group/${preview.group_id}`)); return; }

    // guests (and accounts with no name yet) need a display name before they appear in a roster
    const needsName = !isAccount || !profile;
    if (needsName || (name.trim() !== '' && name.trim() !== profile?.display_name)) {
      const v = validateDisplayName(name);
      if (!v.ok) { setNameError(v.error); return; }
      try { await setProfile(v.value); } catch (e) { setFailure(messageForError(e)); return; }
    }

    try {
      const res = await joinGroup(normalizeCode(code));
      if (!res.ok) { setFailure(messageForCode(res.error)); return; }
      await qc.invalidateQueries({ queryKey: ['groups', userId] });
      router.replace(href(`/group/${res.group_id}`));
    } catch (e) {
      setFailure(messageForError(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        {!preview ? (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">Enter your invite code</Text>
              <Text muted>It's {CODE_LENGTH} letters and numbers, from a friend's message or link.</Text>
            </View>
            <TextField
              label="Invite code"
              value={code}
              onChangeText={(t) => { setCode(normalizeCode(t)); if (codeError) setCodeError(null); }}
              placeholder="SQ7K2M"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={CODE_LENGTH + 3}
              returnKeyType="go"
              onSubmitEditing={() => checkCode()}
              accessibilityHint="Six characters"
              error={codeError}
            />
            <Button label="Continue" onPress={() => checkCode()} />
          </>
        ) : (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="small" muted>You're invited to</Text>
              <Text variant="title" accessibilityRole="header">{preview.group_name}</Text>
              <Text muted>Started by {preview.owner_name}</Text>
            </View>
            <Notice>Who's in the group shows after you join.</Notice>

            {preview.already_member ? (
              <Button label="Open group" onPress={join} />
            ) : (
              <>
                {isAccount && profile ? (
                  <Text>You'll join as <Text variant="bodyStrong">{profile.display_name}</Text>.</Text>
                ) : (
                  <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                    <TextField
                      label="Your name"
                      value={name}
                      onChangeText={(t) => { nameTouched.current = true; setName(t); if (nameError) setNameError(null); }}
                      placeholder="Your first name"
                      autoComplete="given-name"
                      textContentType="givenName"
                      maxLength={80}
                      error={nameError}
                      hint={isAccount ? undefined : 'Saved on this device. You can sign in later without losing your place.'}
                    />
                  </View>
                )}
                {failure ? <Notice tone="error">{failure}</Notice> : null}
                <Button label={isAccount ? 'Join group' : 'Continue as guest'} onPress={join} />
                {!isAccount ? (
                  <Button
                    label="Sign in instead"
                    variant="secondary"
                    accessibilityHint="Sign in with Apple or email, then come back to this invitation"
                    onPress={() => router.push(signInHref(`/join/${normalizeCode(code)}`))}
                  />
                ) : null}
              </>
            )}
            {failure && preview.already_member ? <Notice tone="error">{failure}</Notice> : null}
            <Button label="Use a different code" variant="ghost" onPress={() => { setPreview(null); setFailure(null); }} />
            <Text variant="caption" muted accessibilityLabel={`Code ${spellCode(normalizeCode(code))}`}>Code {normalizeCode(code)}</Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md } });
