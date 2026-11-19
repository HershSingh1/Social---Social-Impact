// Figma 4145:23408 refers to TEC-109 screens B and C: the opt-in switch next to the private budget. The Profile screen isn't
// on v2-figma yet, so it sits in Settings. The text says nobody sees your amount.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Card, ErrorState, Label, Loading } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { fetchOptIn, OPT_IN_FAILED, optInKey, setOptIn } from './budget';

export function BudgetOptIn({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const opt = useQuery({ queryKey: optInKey(userId), queryFn: () => fetchOptIn(userId) });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: boolean) {
    if (saving) return;
    setSaving(true); setFailed(false);
    try {
      await setOptIn(next);
      queryClient.setQueryData(optInKey(userId), next);
    } catch { setFailed(true); } finally { setSaving(false); }
  }

  return <Card><View style={styles.copy}>
    <Label style={type.headline}>Group budget filter</Label>
    {opt.isPending ? <Loading label="Loading your setting…" />
      : opt.data === undefined ? <ErrorState message="Couldn’t load this setting." onRetry={async () => { await opt.refetch(); }} />
        : <>
          <View style={styles.row}>
            <Label style={styles.flex}>Use my budget in group filters</Label>
            <Switch accessibilityLabel="Use my budget in group filters" value={opt.data} disabled={saving} onValueChange={next => { void change(next); }}
              trackColor={{ true: color.primary }} />
            <Label style={type.bodyStrong}>{saving ? 'Saving…' : opt.data ? 'On' : 'Off'}</Label>
          </View>
          <Label style={styles.muted}>Nobody sees your amount. It only helps hide activities above what everyone in a group opted in to spend.</Label>
          {failed && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{OPT_IN_FAILED}</Label>}
        </>}
  </View></Card>;
}

const styles = StyleSheet.create({
  copy: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  muted: { color: color.textSecondary },
});
