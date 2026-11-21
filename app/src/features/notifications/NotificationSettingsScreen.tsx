// Frame: `TEC-150 · Settings: Notifications and Nudge (P1-04) · draft`, boards A and C (design artifact Y5tCN8ATC9EHfKB71G2MwH).
// One switch per kind. Denied in iPhone Settings: the switches are read-only and say how to turn it on. Nothing breaks.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, View } from 'react-native';
import { Button, Card, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { askAccess, getAccess } from './device';
import { KINDS, type Kind } from './kinds';
import { fetchPrefs, prefsKey, setPref } from './prefs';
import { registerPhone } from './register';

const accessKey = ['notification-access'] as const;

export function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: accessKey, queryFn: getAccess, staleTime: 0 });
  const prefs = useQuery({ queryKey: prefsKey, queryFn: fetchPrefs });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [failed, setFailed] = useState<Kind | null>(null);

  // Coming back from iPhone Settings: the permission may have changed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void queryClient.invalidateQueries({ queryKey: accessKey }); });
    return () => sub.remove();
  }, [queryClient]);

  async function toggle(kind: Kind, enabled: boolean) {
    if (busy) return;
    setBusy(kind); setFailed(null);
    try {
      await setPref(kind, enabled);
      await queryClient.invalidateQueries({ queryKey: prefsKey });
    } catch { setFailed(kind); }
    finally { setBusy(null); }
  }

  async function allow() {
    const result = await askAccess();
    await queryClient.invalidateQueries({ queryKey: accessKey });
    if (result === 'granted') await registerPhone();
  }

  const denied = access.data === 'denied';
  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Notifications</Label>
    {denied && <>
      <Label accessibilityRole="alert" style={styles.warn}>Notifications are off for Sidequest. Turn them on in iPhone Settings to get these. Everything still shows in your Plans tab.</Label>
      <Button label="Open iPhone Settings" onPress={async () => { await Linking.openSettings(); }} />
    </>}
    {access.data === 'undetermined' && <Card>
      <Label style={type.bodyStrong}>Notifications are off until you allow them.</Label>
      <Label style={styles.muted}>Your choices below are saved either way. Everything still shows in your Plans tab.</Label>
      <Button label="Turn on notifications" errorMessage="Couldn’t ask for notifications. Try again." onPress={allow} />
    </Card>}
    {prefs.isPending ? <Loading label="Loading your notification choices…" />
      : !prefs.data ? <ErrorState message="Couldn’t load your notification choices." onRetry={async () => { await prefs.refetch(); }} />
      : <Card>
        <View style={denied && styles.dim}>
          {KINDS.map(({ kind, label, example }) => {
            const on = prefs.data[kind];
            return <View key={kind}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Label style={type.bodyStrong}>{label}</Label>
                  {!denied && <Label style={styles.muted}>{example}</Label>}
                </View>
                <Switch accessibilityLabel={label} value={on} disabled={denied || busy !== null}
                  onValueChange={next => { void toggle(kind, next); }} trackColor={{ true: color.primary }} />
                <Label style={type.bodyStrong}>{busy === kind ? 'Saving…' : on ? 'On' : 'Off'}</Label>
              </View>
              {failed === kind && <>
                <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>Couldn’t save. Try again.</Label>
                <Button label="Try again" size="small" variant="secondary" onPress={() => toggle(kind, !on)} />
              </>}
            </View>;
          })}
        </View>
      </Card>}
    <Label style={styles.muted}>{denied ? 'Your choices are saved. They apply as soon as notifications are allowed.'
      : 'Turning one off stops only that kind. Everything still appears in your Plans tab.'}</Label>
  </Screen>;
}

const styles = StyleSheet.create({
  muted: { color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  flex: { flex: 1 },
  dim: { opacity: 0.5 },
});
