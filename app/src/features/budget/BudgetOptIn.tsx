// Figma 4145:23408 and TEC-109 boards B and C: the opt-in switch under the private budget on "Budget and getting around".
// Without a saved budget there is nothing to count, so it is off and says how to turn it on. The text says nobody sees your amount.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Card, ErrorState, Label, Loading } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { fetchOptIn, OPT_IN_FAILED, optInKey, setOptIn } from './budget';

export function BudgetOptIn({ userId, hasBudget = true }: { userId: string; hasBudget?: boolean }) {
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
    {opt.isPending ? <Loading label="Loading your setting…" />
      : opt.data === undefined ? <ErrorState message="Couldn’t load this setting." onRetry={async () => { await opt.refetch(); }} />
        : <>
          <View style={styles.row}>
            <View style={styles.flex}><Label style={type.bodyStrong}>Use my budget in group filters</Label>
              <Label style={styles.muted}>{hasBudget
                ? 'Nobody sees your amount. The filter hides activities above the lowest budget among people who opted in, and only when at least 3 people have.'
                : 'Set a budget to turn this on.'}</Label></View>
            <Switch accessibilityLabel="Use my budget in group filters" value={hasBudget && opt.data} disabled={saving || !hasBudget} onValueChange={next => { void change(next); }}
              trackColor={{ true: color.primary }} />
            <Label style={type.bodyStrong}>{saving ? 'Saving…' : hasBudget && opt.data ? 'On' : 'Off'}</Label>
          </View>
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
