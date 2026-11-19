// Figma 4145:20920 (file MkYNxuYFuktTR0yGExJnK7) boards B, C and D: Settings, Calendar. Permission is asked only when the person
// taps Allow. Which calendars count stays on the phone; which groups see Free or Busy is per group.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Screen, Tag } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { useMyGroups } from '../groups/useMyGroups';
import { askAccess, getAccess, listCalendars, loadCounted, saveCounted } from './device';
import { fetchShares, setShare, sharesKey } from './sharing';

const accessKey = ['calendar-access'] as const;
const calendarsKey = ['calendar-list'] as const;
const countedKey = (userId: string) => ['calendar-counted', userId] as const;

export function CalendarSettingsScreen({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: accessKey, queryFn: getAccess, staleTime: 0 });
  const shares = useQuery({ queryKey: sharesKey, queryFn: fetchShares });
  // Coming back from iPhone Settings: the permission may have changed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void queryClient.invalidateQueries({ queryKey: accessKey }); });
    return () => sub.remove();
  }, [queryClient]);

  // Revoked in iPhone Settings: the calendar answers are cleared, once per visit (board D).
  const cleared = useRef(false);
  const denied = access.data === 'denied';
  const shared = shares.data;
  useEffect(() => {
    if (!denied || !shared || shared.size === 0 || cleared.current) return;
    cleared.current = true;
    void Promise.all([...shared].map(id => setShare(id, false))).then(() => queryClient.invalidateQueries({ queryKey: sharesKey })).catch(() => { cleared.current = false; });
  }, [denied, shared, queryClient]);

  if (access.isPending) return <Screen><Loading label="Loading your calendars…" /></Screen>;
  if (access.data === undefined) return <Screen><ErrorState message="Couldn’t check calendar access." onRetry={async () => { await access.refetch(); }} /></Screen>;

  return <Screen>
    <Label accessibilityRole="header" style={type.title1}>Calendar</Label>
    {access.data === 'granted' ? <Allowed userId={userId} shares={shares} />
      : denied ? <Denied /> : <NotAllowed onAllow={async () => { await askAccess(); await queryClient.invalidateQueries({ queryKey: accessKey }); }} />}
  </Screen>;
}

function NotAllowed({ onAllow }: { onAllow: () => Promise<void> }) {
  return <>
    <Card>
      <Label accessibilityRole="header" style={type.title2}>Pre-fill Free or Busy</Label>
      <Label>Sidequest can check your phone’s calendars and mark you Free or Busy on a proposed time. It only asks “is there an event then?”</Label>
      <Label style={type.bodyStrong}>Never read, stored or sent: event titles, people, places or notes.</Label>
      <Label style={styles.muted}>You choose which calendars count and which groups see your answer. Everyone else sees counts only.</Label>
    </Card>
    <Tag label="Calendar access: Off" />
    <Button label="Allow calendar access" errorMessage="Couldn’t ask for calendar access. Try again." onPress={onAllow} />
    <Label style={styles.muted}>Not now? Free and Busy still work. Tap them by hand on any pick.</Label>
  </>;
}

function Denied() {
  return <>
    <Tag label="Calendar access: Off in iPhone Settings" />
    <Label accessibilityRole="alert" style={styles.warn}>Calendar is off for Sidequest. Turn it on in iPhone Settings to pre-fill Free or Busy. Until then your calendar answers are cleared and others see you as not answered.</Label>
    <Button label="Open iPhone Settings" onPress={async () => { await Linking.openSettings(); }} />
    <Label style={styles.muted}>You can still tap Free or Busy by hand on any pick. Nothing else changes.</Label>
  </>;
}

function Allowed({ userId, shares }: { userId: string; shares: ReturnType<typeof useQuery<Set<string>>> }) {
  const queryClient = useQueryClient();
  const calendars = useQuery({ queryKey: calendarsKey, queryFn: listCalendars, staleTime: 0 });
  const counted = useQuery({ queryKey: countedKey(userId), queryFn: () => loadCounted(userId) });
  const groups = useMyGroups(userId);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ groupId: string; name: string; enabled: boolean } | null>(null);

  async function toggleGroup(groupId: string, name: string, enabled: boolean) {
    if (busy) return;
    setBusy(groupId); setFailed(null);
    try { await setShare(groupId, enabled); await queryClient.invalidateQueries({ queryKey: sharesKey }); }
    catch { setFailed({ groupId, name, enabled }); } finally { setBusy(null); }
  }
  async function toggleCalendar(id: string, on: boolean, all: string[]) {
    const current = counted.data ?? all;
    const next = on ? [...new Set([...current, id])] : current.filter(c => c !== id);
    await saveCounted(userId, next);
    await queryClient.invalidateQueries({ queryKey: countedKey(userId) });
  }
  async function turnOff() {
    for (const id of shares.data ?? []) await setShare(id, false);
    await queryClient.invalidateQueries({ queryKey: sharesKey });
  }

  return <>
    <Tag label="Calendar access: On" variant="dark" />
    <Card>
      <Label style={styles.overline}>CALENDARS THAT COUNT</Label>
      {calendars.isPending || counted.isPending ? <Loading label="Loading your calendars…" />
        : !calendars.data ? <ErrorState message="Couldn’t load your calendars." onRetry={async () => { await calendars.refetch(); }} />
          : calendars.data.length === 0 ? <>
            <Empty title="No calendars on this phone" description="Add a calendar in iPhone Settings, then come back." />
            <Button label="Open iPhone Settings" variant="secondary" onPress={async () => { await Linking.openSettings(); }} />
          </>
            : calendars.data.map(c => {
              const on = !counted.data || counted.data.includes(c.id);
              return <SwitchRow key={c.id} label={c.title} switchLabel={`${c.title} counts`} on={on}
                onChange={next => toggleCalendar(c.id, next, calendars.data!.map(x => x.id))} />;
            })}
    </Card>
    <Card>
      <Label style={styles.overline}>GROUPS THAT SEE FREE OR BUSY</Label>
      {groups.isPending || shares.isPending ? <Loading label="Loading your groups…" />
        : !groups.data || !shares.data ? <ErrorState message="Couldn’t load your groups." onRetry={async () => { await Promise.all([groups.refetch(), shares.refetch()]); }} />
          : groups.data.length === 0 ? <>
            <Empty title="You’re not in a group yet" description="Join a group to share Free or Busy with it." />
            <Button label="Join with code" variant="secondary" onPress={() => router.push('/join' as never)} />
          </>
            : groups.data.map(g => {
              const on = shares.data!.has(g.id);
              return <SwitchRow key={g.id} label={g.name} sub={on ? 'Sees Free or Busy' : 'Not shared'} switchLabel={`Share with ${g.name}`} on={on}
                busy={busy === g.id} onChange={next => toggleGroup(g.id, g.name, next)} />;
            })}
      {failed && <>
        <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>Couldn’t update {failed.name}. Try again.</Label>
        <Button label="Try again" size="small" variant="secondary" onPress={() => toggleGroup(failed.groupId, failed.name, failed.enabled)} />
      </>}
    </Card>
    <Label style={styles.muted}>Turning a group off removes your calendar answers from it. Plans stay as they are.</Label>
    <Button label="Turn off calendar" variant="secondary" disabled={!shares.data?.size} errorMessage="Couldn’t turn it off. Try again." onPress={turnOff} />
  </>;
}

function SwitchRow({ label, sub, switchLabel, on, busy = false, onChange }: {
  label: string; sub?: string; switchLabel: string; on: boolean; busy?: boolean; onChange: (next: boolean) => void | Promise<void>;
}) {
  return <View style={styles.row}>
    <View style={styles.flex}>
      <Label style={type.bodyStrong}>{label}</Label>
      {sub && <Label style={styles.muted}>{sub}</Label>}
    </View>
    <Switch accessibilityLabel={switchLabel} value={on} disabled={busy} onValueChange={next => { void onChange(next); }} trackColor={{ true: color.primary }} />
    <Label style={type.bodyStrong}>{busy ? 'Saving…' : on ? 'On' : 'Off'}</Label>
  </View>;
}

const styles = StyleSheet.create({
  muted: { color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  flex: { flex: 1 },
});
