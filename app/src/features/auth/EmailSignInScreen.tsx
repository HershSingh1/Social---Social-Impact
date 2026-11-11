import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Label, Screen, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { isEmail, MAX_CODE_TRIES, sendEmailCode, verifyEmailCode } from './api';

const SEND_FAILED = 'Couldn’t send the code. Check your connection and try again.';
const TOO_MANY = 'Too many tries. Send a new code.';

// Figma has no email-code screen, so this uses the UI kit. Success needs no navigation: the auth gate
// moves on as soon as the session exists.
export function EmailSignInScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [wrongTries, setWrongTries] = useState(0);

  async function send() {
    if (!isEmail(email)) { setEmailError('Enter an email address like name@example.com.'); return; }
    setEmailError(undefined);
    await sendEmailCode(email);
    setSentTo(email.trim());
    setCode('');
    setCodeError(undefined);
    setWrongTries(0);
  }

  async function verify() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) { setCodeError('Enter the 6-digit code from the email.'); return; }
    if (await verifyEmailCode(sentTo, code)) return;
    const tries = wrongTries + 1;
    setWrongTries(tries);
    setCodeError(tries >= MAX_CODE_TRIES ? TOO_MANY : 'That code is wrong or has expired.');
  }

  if (!sentTo) {
    return <Screen>
      <Button label="Back" variant="text" size="small" onPress={onBack} />
      <Label accessibilityRole="header" style={type.title1}>Sign in with email</Label>
      <Label style={styles.secondary}>We’ll email you a 6-digit code.</Label>
      <TextField label="Email" value={email} onChangeText={setEmail} error={emailError}
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Button label="Send code" onPress={send} errorMessage={SEND_FAILED} />
    </Screen>;
  }

  const locked = wrongTries >= MAX_CODE_TRIES;
  return <Screen>
    <Button label="Use a different email" variant="text" size="small" onPress={() => setSentTo(undefined)} />
    <Label accessibilityRole="header" style={type.title1}>Enter your code</Label>
    <Label style={styles.secondary}>We sent a 6-digit code to {sentTo}. It works for 10 minutes.</Label>
    <TextField label="6-digit code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
      error={codeError} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
    <View style={styles.actions}>
      <Button label="Verify" onPress={verify} disabled={locked} errorMessage="Couldn’t check the code. Try again." />
      <Button label="Send a new code" variant="secondary" onPress={send} errorMessage={SEND_FAILED} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  secondary: { color: color.textSecondary },
  actions: { gap: space.md },
});
