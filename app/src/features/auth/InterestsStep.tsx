// Figma: 28:3118 1.4 Interests & Budget (file MkYNxuYFuktTR0yGExJnK7)
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Label } from '../../ui';
import { color, inset, minTap, radius, size, space, type } from '../../ui/theme';
import { INTEREST_GROUPS, MIN_INTERESTS, SPEND_OPTIONS, saveInterests } from './onboarding';
import { OnboardingFrame } from './OnboardingFrame';

export type Picks = { selected: string[]; spend: number | null };
type Props = { initial: Picks; onBack: () => void; onSkip: () => Promise<void>; onSaved: (saved: Picks) => Promise<void> };

// Selected chips are the orange ones in the frame. The check mark is added because the status can't rest on color alone.
function InterestChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected }}
    onPress={onPress} style={styles.hit}>
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Label style={[type.subhead, selected && { color: color.orangeInk }]}>{selected ? `✓ ${label}` : label}</Label>
    </View>
  </Pressable>;
}

export function InterestsStep({ initial, onBack, onSkip, onSaved }: Props) {
  const [picks, setPicks] = useState(initial);
  const count = picks.selected.length;
  const toggle = (id: string) => setPicks(current => ({
    ...current, selected: current.selected.includes(id) ? current.selected.filter(other => other !== id) : [...current.selected, id],
  }));

  async function submit() {
    await saveInterests(picks.selected, picks.spend);
    await onSaved(picks);
  }

  return <OnboardingFrame step={2} title="What are you into?" onBack={onBack} onSkip={onSkip}
    subtitle={`Pick at least ${MIN_INTERESTS}. We combine everyone’s interests to suggest plans for your groups.`}
    footer={<Button label={count > 0 ? `Continue · ${count} selected` : 'Continue'} disabled={count < MIN_INTERESTS} onPress={submit}
      errorMessage="Couldn’t save your answers. Check your connection and try again." />}>
    {INTEREST_GROUPS.map(group => <View key={group.title} style={styles.group}>
      <Label accessibilityRole="header" style={styles.overline}>{group.title.toUpperCase()}</Label>
      <View style={styles.chips}>
        {group.items.map(([id, label]) => <InterestChip key={id} label={label} selected={picks.selected.includes(id)} onPress={() => toggle(id)} />)}
      </View>
    </View>)}
    <View style={styles.group}>
      <Label accessibilityRole="header" style={styles.overline}>TYPICAL SPEND PER OUTING</Label>
      <View accessibilityRole="radiogroup" style={styles.segments}>
        {SPEND_OPTIONS.map(option => {
          const checked = picks.spend === option.cap;
          return <Pressable key={option.label} accessibilityRole="radio" accessibilityLabel={`${option.label}, ${option.hint}`}
            accessibilityState={{ checked }} onPress={() => setPicks(current => ({ ...current, spend: checked ? null : option.cap }))}
            style={[styles.segment, checked && styles.segmentChecked]}>
            <Label style={[type.subhead, checked && type.bodyStrong]}>{option.label}</Label>
          </Pressable>;
        })}
      </View>
      <Label style={styles.caption}>Private — only used to keep group suggestions affordable for you.</Label>
    </View>
  </OnboardingFrame>;
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  overline: { ...type.overline, color: color.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm },
  hit: { minHeight: minTap, justifyContent: 'center' },
  chip: { minHeight: size.chip, paddingHorizontal: inset.chip, paddingVertical: space.sm, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg, borderWidth: 1, borderColor: color.lineStrong },
  chipSelected: { backgroundColor: color.orangeSoft, borderColor: color.orange },
  segments: { flexDirection: 'row', padding: space.xs, gap: space.xs, borderRadius: radius.sm, backgroundColor: color.muted },
  segment: { flex: 1, minHeight: minTap, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs },
  segmentChecked: { backgroundColor: color.bg },
  caption: { ...type.caption, color: color.textSecondary },
});
