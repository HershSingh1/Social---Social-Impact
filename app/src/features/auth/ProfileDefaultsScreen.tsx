// Frame: `TEC-109 · Profile defaults and photo (P0-17) · draft`, Figma 4145:12152 (file MkYNxuYFuktTR0yGExJnK7), boards B to F:
// nothing set, saved, field error, error on save, loading. The Profile tab is not built, so this opens from Settings.
// C5: these values are stored and shown here only. They do not start the price filter.
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ErrorState, Label, Loading, Screen, TextField } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { BudgetOptIn } from '../budget/BudgetOptIn';
import { budgetText, defaultsKey, fetchDefaults, parseBudget, SAVE_FAILED, saveDefaults, TRANSPORT, type Defaults, type Transport } from './defaults';

const PRIVACY = 'Only you can see this. It is never shown to your groups or copied into a plan.';

function Privacy() {
  return <Card><View style={styles.privacy}>
    <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name="lock-closed-outline" size={18} color={color.text} />
    </View>
    <Label style={styles.flex}>{PRIVACY}</Label>
  </View></Card>;
}

export function ProfileDefaultsScreen({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: defaultsKey(userId), queryFn: () => fetchDefaults(userId) });
  const title = <Label accessibilityRole="header" style={type.title1}>Budget and getting around</Label>;
  if (query.isPending) return <Screen footer={<Button label="Save" disabled onPress={async () => {}} />}>
    {title}<Privacy /><Loading label="Loading your saved values…" />
  </Screen>;
  if (query.data === undefined) return <Screen>{title}<Privacy />
    <ErrorState message="Couldn’t load your saved values." onRetry={async () => { await query.refetch(); }} /></Screen>;
  return <Form userId={userId} saved={query.data} />;
}

function Form({ userId, saved }: { userId: string; saved: Defaults }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(budgetText(saved.budget));
  const [transport, setTransport] = useState<Transport | null>(saved.transport);
  const [fieldError, setFieldError] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Any change enables Save, even an amount that can't be used yet: pressing it is how the person is told why.
  const dirty = text.trim() !== budgetText(saved.budget) || transport !== saved.transport;
  const edited = () => { setJustSaved(false); setFailed(false); };

  // Never clears what was typed: a refused amount or a failed save leaves the field and the chip as they were.
  async function save() {
    const found = parseBudget(text);
    if (found.error) { setFieldError(found.error); return; }
    setFieldError(undefined); setFailed(false);
    const next = { budget: found.value, transport };
    try { await saveDefaults(next); }
    catch { setFailed(true); return; }
    queryClient.setQueryData(defaultsKey(userId), next);
    setText(budgetText(next.budget));
    setJustSaved(true);
  }

  return <Screen footer={<Button label={justSaved && !dirty ? 'Saved' : 'Save'} disabled={!dirty} onPress={save} />}>
    <Label accessibilityRole="header" style={type.title1}>Budget and getting around</Label>
    <Privacy />
    <TextField label="Usual budget, per person (optional)" value={text} onChangeText={next => { setText(next); setFieldError(undefined); edited(); }}
      error={fieldError} keyboardType="decimal-pad" placeholder="No budget set" />
    {!fieldError && !failed && <Label style={styles.muted}>{text.trim() ? 'Dollars for one outing. 0 to 1,000.' : 'Dollars for one outing. 0 to 1,000, cents allowed.'}</Label>}
    {text.trim() !== '' && <View style={styles.start}><Button label="Clear budget" variant="text" size="small"
      onPress={async () => { setText(''); setFieldError(undefined); edited(); }} /></View>}
    <View style={styles.group}>
      <Label accessibilityRole="header" style={styles.groupLabel}>How you usually get around</Label>
      <View style={styles.chips}>
        {TRANSPORT.map(([id, label]) => <Chip key={id} label={label} selected={transport === id}
          onPress={() => { setTransport(transport === id ? null : id); edited(); }} />)}
        <Chip label="No preference" selected={transport === null} onPress={() => { setTransport(null); edited(); }} />
      </View>
    </View>
    <BudgetOptIn userId={userId} hasBudget={saved.budget !== null} />
    {failed && <>
      <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.banner}>{SAVE_FAILED}</Label>
      <Button label="Try again" variant="secondary" onPress={save} />
    </>}
    {justSaved && <View style={styles.saved} accessible accessibilityLiveRegion="polite" accessibilityLabel="Saved just now">
      <Ionicons name="checkmark" size={16} color={color.text} />
      <Label style={type.bodyStrong}>Saved just now</Label>
    </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tile: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: color.orange, backgroundColor: color.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  muted: { ...type.caption, color: color.textSecondary },
  start: { alignSelf: 'flex-start' },
  group: { gap: space.sm },
  groupLabel: { ...type.subhead, color: color.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  banner: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: radius.sm },
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
