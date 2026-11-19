// Figma (TEC-153 board D): private preferences. No budget range (C5). Nothing here is shown to a group.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ErrorState, Label, Loading, Screen, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { ACCESS_CHIPS, clearPreferences, DAYS, EMPTY_PREFS, fetchPreferences, NEEDS_MAX, prefsEmpty, PREFS_FAILED, prefsKey, savePreferences, TIMES,
  validatePrefs, type Prefs } from './feedback';

export function PreferencesScreen({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: prefsKey(userId), queryFn: fetchPreferences });
  if (query.isPending) return <Screen><Loading label="Loading your preferences…" /></Screen>;
  if (query.data === undefined) return <Screen><ErrorState message="Couldn’t load your preferences." onRetry={async () => { await query.refetch(); }} /></Screen>;
  return <Form userId={userId} saved={query.data} />;
}

const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

function Form({ userId, saved }: { userId: string; saved: Prefs | null }) {
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>(saved ?? EMPTY_PREFS);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const empty = prefsEmpty(prefs);

  async function save() {
    const found = validatePrefs(prefs);
    setError(found);
    if (found) return;
    await savePreferences(prefs);
    setCleared(false);
    await queryClient.invalidateQueries({ queryKey: prefsKey(userId) });
  }
  async function clear() {
    await clearPreferences();
    setPrefs(EMPTY_PREFS); setError(null); setCleared(true);
    await queryClient.invalidateQueries({ queryKey: prefsKey(userId) });
  }

  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Preferences</Label>
    <Card><Label>Only you can see this. It is never shown to your groups.</Label></Card>
    <View style={styles.group}>
      <Label accessibilityRole="header" style={styles.label}>Days you prefer</Label>
      <View style={styles.chips}>{DAYS.map(([id, label]) => <Chip key={id} label={label} selected={prefs.days.includes(id)}
        onPress={() => setPrefs({ ...prefs, days: toggle(prefs.days, id) })} />)}</View>
    </View>
    <View style={styles.group}>
      <Label accessibilityRole="header" style={styles.label}>Times you prefer</Label>
      <View style={styles.chips}>{TIMES.map(([id, label]) => <Chip key={id} label={label} selected={prefs.times.includes(id)}
        onPress={() => setPrefs({ ...prefs, times: toggle(prefs.times, id) })} />)}</View>
    </View>
    <View style={styles.group}>
      <Label accessibilityRole="header" style={styles.label}>Accessibility needs</Label>
      <View style={styles.chips}>{ACCESS_CHIPS.map(c => <Chip key={c} label={c} selected={prefs.chips.includes(c)}
        onPress={() => setPrefs({ ...prefs, chips: toggle(prefs.chips, c) })} />)}</View>
      <TextField label="Anything else (optional)" value={prefs.other} onChangeText={other => setPrefs({ ...prefs, other })} error={error ?? undefined} />
      <Label style={styles.caption}>Up to {NEEDS_MAX} characters in all.</Label>
    </View>
    {cleared && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>Your preferences were cleared.</Label>}
    <Button label="Save preferences" disabled={empty && !saved} errorMessage={PREFS_FAILED} onPress={save} />
    <Button label="Clear all preferences" variant="text" disabled={!saved} errorMessage="Couldn’t clear your preferences. Try again." onPress={clear} />
  </Screen>;
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  label: { ...type.subhead, color: color.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  caption: { ...type.caption, color: color.textSecondary },
});
