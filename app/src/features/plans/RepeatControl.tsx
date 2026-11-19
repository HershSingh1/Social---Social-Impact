// Figma 4145:29393, boards A and B: the Repeat row on a plan and its sheet. Organizer only; the server checks that too.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Label, Sheet } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { REPEAT_OPTIONS, repeatFailed, repeatLabel, setRepeat, type RepeatRule } from './again';

type Props = { planId: string; rule: RepeatRule | null; onSaved: () => void };

export function RepeatControl({ planId, rule, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<RepeatRule | null>(rule);
  return <>
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={`Repeat, ${repeatLabel(rule)}. Change`}
        onPress={() => { setChoice(rule); setOpen(true); }} style={styles.row}>
        <View style={styles.flex}>
          <Label style={type.bodyStrong}>Repeat</Label>
          <Label style={styles.caption}>{repeatLabel(rule)}</Label>
        </View>
        <Label style={type.title2}>›</Label>
      </Pressable>
    </Card>
    <Sheet title="Repeat" visible={open} onClose={() => setOpen(false)}>
      <View accessibilityRole="radiogroup">
        {REPEAT_OPTIONS.map(o => <Pressable key={o.label} accessibilityRole="radio" accessibilityLabel={o.label}
          accessibilityState={{ checked: choice === o.rule }} onPress={() => setChoice(o.rule)} style={styles.row}>
          <Label style={[type.bodyStrong, styles.flex]}>{o.label}</Label>
          {choice === o.rule && <Label style={type.bodyStrong}>✓ Chosen</Label>}
        </Pressable>)}
      </View>
      <Label>Seven days before the next date, we’ll remind you to plan it again. Nothing is sent until you review and send it.</Label>
      <Button label="Save" errorMessage={repeatFailed}
        onPress={async () => { await setRepeat(planId, choice); setOpen(false); onSaved(); }} />
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  row: { minHeight: minTap, flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  caption: { ...type.caption, color: color.textSecondary },
});
