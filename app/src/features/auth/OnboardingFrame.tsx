import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Label, Screen } from '../../ui';
import { color, minTap, size, space, type } from '../../ui/theme';

type Props = {
  step: 1 | 2 | 3;
  title: string;
  subtitle: string;
  onBack: () => void;
  backLabel?: string;
  /** Only on the interests step: skips it without saving. */
  onSkip?: () => void;
  footer: ReactNode;
  children: ReactNode;
};

// What the three onboarding frames share (Figma 1.3, 1.4, 1.5): the back arrow, "Step N of 3", the progress line,
// the title with its subtitle, and the footer bar pinned under the content.
export function OnboardingFrame({ step, title, subtitle, onBack, backLabel = 'Back', onSkip, footer, children }: Props) {
  return <Screen tinted footer={footer}>
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.side}>
        <MaterialCommunityIcons name="chevron-left" size={size.tabIcon + 2} color={color.text} />
      </Pressable>
      <Label accessibilityRole="header" style={[type.bodyStrong, styles.step]}>{`Step ${step} of 3`}</Label>
      <View style={[styles.side, styles.end]}>
        {onSkip && <Button label="Skip" variant="text" size="small" onPress={onSkip} />}
      </View>
    </View>
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${(step / 3) * 100}%` }]} />
    </View>
    <View style={styles.heading}>
      <Label accessibilityRole="header" style={type.title1}>{title}</Label>
      <Label style={styles.secondary}>{subtitle}</Label>
    </View>
    {children}
  </Screen>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { minWidth: minTap, minHeight: minTap, justifyContent: 'center' },
  end: { alignItems: 'flex-end' },
  step: { textAlign: 'center' },
  track: { height: 3, backgroundColor: color.lineStrong },
  fill: { height: 3, backgroundColor: color.primary },
  heading: { gap: space.sm },
  secondary: { color: color.textSecondary },
});
