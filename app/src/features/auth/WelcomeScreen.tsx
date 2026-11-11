import { Image, StyleSheet, View } from 'react-native';
import { Button, Label, Screen } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { signInWithGoogle } from './api';
import { savePendingLink } from './AuthProvider';

type Props = { onEmail: () => void };

// Figma 1.1 Welcome (28:3027). Continue with Apple is left out until P2 (D10).
export function WelcomeScreen({ onEmail }: Props) {
  return <Screen>
    <Image source={require('../../../assets/welcome.jpg')} style={styles.hero} accessible={false} />
    <View style={styles.intro}>
      <Label accessibilityRole="header" style={[type.display, styles.center]}>Sidequest</Label>
      <Label style={[styles.secondary, styles.center]}>Find something to do, a time that works, and people to do it with.</Label>
    </View>
    <View style={styles.actions}>
      <Button label="Continue with Google" errorMessage="Couldn’t sign in with Google. Try again."
        onPress={async () => { await signInWithGoogle(); }} />
      <Button label="Continue with email" variant="secondary" onPress={onEmail} />
      <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.rule} /><Label style={styles.caption}>or</Label><View style={styles.rule} />
      </View>
      {/* Joining needs an account (D1): remember where to go, sign in, then open the join screen. */}
      <Button label="Join a group with a code" variant="text"
        onPress={async () => { await savePendingLink('/join'); onEmail(); }} />
      <Label style={[styles.caption, styles.center]}>By continuing you agree to the Terms and Privacy Policy.</Label>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 350 / 330, borderRadius: radius.xl + 4 },
  intro: { gap: space.sm, paddingHorizontal: space.sm },
  center: { textAlign: 'center' },
  secondary: { color: color.textSecondary },
  actions: { gap: space.md, marginTop: 'auto' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1, backgroundColor: color.line },
  caption: { ...type.caption, color: color.textSecondary },
});
