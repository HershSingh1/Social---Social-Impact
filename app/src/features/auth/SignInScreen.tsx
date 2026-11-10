import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Screen, Text, TextField, space } from '@/shared/ui';
import { href, safeReturnTo } from '@/shared/lib/nav';
import { messageForError } from '@/shared/lib/errors';
import { validateDisplayName, validateEmail, validateOtp } from '@/shared/lib/validation';
import { useAuth } from './AuthProvider';
import {
  guestHasActivity, isAppleSignInAvailable, sendExistingAccountCode, setProfile, signInWithApple,
  startEmailUpgrade, switchToExistingApple, verifyEmailCode, type EmailStart,
} from './api';
import { otpErrorMessage } from './errors';

type Step =
  | { kind: 'choose' }
  | { kind: 'email' }
  | { kind: 'code'; email: string; mode: EmailStart['mode'] }
  | { kind: 'exists'; via: { type: 'apple'; token: string; nonce: string; fullName: string | null } | { type: 'email'; email: string } }
  | { kind: 'name'; suggestion: string };

const MAX_CODE_TRIES = 5;

/**
 * P0-02. Shown as a sheet when something needs an account. Whatever the person was doing is passed as
 * `returnTo`, and they land back on exactly that step afterwards. A guest who signs in keeps the same user id.
 */
export function SignInScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { returnTo: rawReturn } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeReturnTo(rawReturn) ?? '/';
  const { userId, loadProfile } = useAuth();

  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [appleOk, setAppleOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const tries = useRef(0);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => { void isAppleSignInAvailable().then(setAppleOk); }, []);

  /** Signed in: make sure there is a display name, then go back to where the person was. */
  async function finish(suggestedName?: string | null) {
    await qc.invalidateQueries();
    const profile = await loadProfile().catch(() => null);
    if (!profile) {
      setName(suggestedName ?? '');
      setStep({ kind: 'name', suggestion: suggestedName ?? '' });
      return;
    }
    router.replace(href(returnTo));
  }

  async function onApple() {
    setError(null);
    try {
      const res = await signInWithApple();
      if (res.status === 'cancelled') return;
      if (res.status === 'done') { await finish(res.fullName); return; }
      // This Apple ID already has an account. A guest with nothing to lose just switches; otherwise ask first.
      const activity = userId ? await guestHasActivity(userId) : false;
      if (!activity) { await switchToExistingApple(res.token, res.nonce); await finish(res.fullName); return; }
      setStep({ kind: 'exists', via: { type: 'apple', token: res.token, nonce: res.nonce, fullName: res.fullName } });
    } catch (e) {
      setError(messageForError(e));
    }
  }

  async function sendEmail() {
    setError(null);
    const v = validateEmail(email);
    if (!v.ok) { setEmailError(v.error); return; }
    setEmailError(null);
    try {
      const start = await startEmailUpgrade(v.value);
      if (start.mode === 'exists') {
        const activity = userId ? await guestHasActivity(userId) : false;
        if (!activity) { await sendExistingAccountCode(v.value); tries.current = 0; setStep({ kind: 'code', email: v.value, mode: 'exists' }); return; }
        setStep({ kind: 'exists', via: { type: 'email', email: v.value } });
        return;
      }
      tries.current = 0;
      setOtp('');
      setStep({ kind: 'code', email: v.value, mode: 'upgrade' });
    } catch (e) {
      setError(messageForError(e));
    }
  }

  async function verify(s: Extract<Step, { kind: 'code' }>) {
    setError(null);
    if (tries.current >= MAX_CODE_TRIES) { setOtpError('Too many tries. Send a new code.'); return; }
    const v = validateOtp(otp);
    if (!v.ok) { setOtpError(v.error); return; }
    try {
      await verifyEmailCode(s.email, v.value, s.mode);
      await finish(null);
    } catch (e) {
      tries.current += 1;
      setOtpError(otpErrorMessage(e)); // the typed digits stay in the field
    }
  }

  async function resend(s: Extract<Step, { kind: 'code' }>) {
    setError(null);
    setOtpError(null);
    try {
      if (s.mode === 'exists') await sendExistingAccountCode(s.email);
      else await startEmailUpgrade(s.email);
      tries.current = 0;
      setOtp('');
    } catch (e) {
      setError(messageForError(e));
    }
  }

  async function confirmSwitch(via: Extract<Step, { kind: 'exists' }>['via']) {
    setError(null);
    try {
      if (via.type === 'apple') { await switchToExistingApple(via.token, via.nonce); await finish(via.fullName); return; }
      await sendExistingAccountCode(via.email);
      tries.current = 0;
      setOtp('');
      setStep({ kind: 'code', email: via.email, mode: 'exists' });
    } catch (e) {
      setError(messageForError(e));
    }
  }

  async function saveName() {
    const v = validateDisplayName(name);
    if (!v.ok) { setNameError(v.error); return; }
    setNameError(null);
    try {
      await setProfile(v.value);
      await qc.invalidateQueries();
      router.replace(href(returnTo));
    } catch (e) {
      setError(messageForError(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        {step.kind === 'choose' && (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">Sign in</Text>
              <Text muted>Keep your groups and plans if you switch phones. Anything you did as a guest stays with you.</Text>
            </View>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {appleOk ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ height: 52 }}
                onPress={onApple}
              />
            ) : null}
            <Button label="Email me a code" variant="secondary" onPress={() => { setError(null); setStep({ kind: 'email' }); }} />
          </>
        )}

        {step.kind === 'email' && (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">Sign in with email</Text>
              <Text muted>We'll send a 6-digit code. No password.</Text>
            </View>
            <TextField
              label="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={sendEmail}
              error={emailError}
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label="Send code" onPress={sendEmail} />
            <Button label="Back" variant="ghost" onPress={() => setStep({ kind: 'choose' })} />
          </>
        )}

        {step.kind === 'code' && (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">Enter your code</Text>
              <Text muted>We sent a 6-digit code to {step.email}. It works for 10 minutes.</Text>
            </View>
            <TextField
              label="Code from your email"
              value={otp}
              onChangeText={(t) => { setOtp(t); if (otpError) setOtpError(null); }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={7}
              returnKeyType="done"
              onSubmitEditing={() => verify(step)}
              error={otpError}
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label="Verify and continue" onPress={() => verify(step)} />
            <Button label="Send a new code" variant="secondary" onPress={() => resend(step)} />
            <Button label="Use a different email" variant="ghost" onPress={() => setStep({ kind: 'email' })} />
          </>
        )}

        {step.kind === 'exists' && (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">This sign-in already has an account</Text>
              <Text muted>
                Sign in to that account instead? The groups you joined as a guest on this device stay with the guest, so
                they won't come with you.
              </Text>
            </View>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label="Sign in to that account" onPress={() => confirmSwitch(step.via)} />
            <Button label="Cancel" variant="secondary" onPress={() => setStep({ kind: 'choose' })} />
          </>
        )}

        {step.kind === 'name' && (
          <>
            <View style={{ gap: space.xs }}>
              <Text variant="title" accessibilityRole="header">What should we call you?</Text>
              <Text muted>This is the name friends see in groups and plans.</Text>
            </View>
            <TextField
              label="Your name"
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(null); }}
              autoComplete="given-name"
              textContentType="givenName"
              maxLength={80}
              error={nameError}
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label="Continue" onPress={saveName} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
