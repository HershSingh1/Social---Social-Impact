// Figma: 4145:22330 TEC-146 · Add to calendar and Update notice (file MkYNxuYFuktTR0yGExJnK7; see docs/figma-frames.md).
// States: A ready, B choose a calendar, C added, D update notice, E access denied.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Label, Sheet } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import type { Plan } from '../plans/plan';
import { addToCalendar, askAccess, CalendarDenied, CalendarGone, clearSaved, loadSaved, staleKind, updateInCalendar, writableCalendars,
  type CalendarChoice, type SavedEvent, type StaleKind } from './addToCalendar';

type Props = { plan: Plan; userId: string };
const savedQuery = (userId: string, planId: string) => ({ queryKey: ['calendarEvent', userId, planId], queryFn: () => loadSaved(userId, planId), staleTime: Infinity });

/** What this phone remembers about the plan's calendar copy. The button and the notice share it. */
function useSaved(userId: string, planId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(savedQuery(userId, planId));
  return { saved: query.data ?? null, ready: !query.isPending, set: (value: SavedEvent | null) => queryClient.setQueryData(savedQuery(userId, planId).queryKey, value) };
}

const addFailed = 'Couldn’t add this to your calendar. Try again.';
const updateFailed = 'Couldn’t update your calendar. Try again.';

function DeniedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <Sheet title="Add to calendar" visible={visible} onClose={onClose}>
    <View accessibilityRole="alert" style={styles.warn}>
      <Label style={type.bodyStrong}>Calendar is off for Sidequest.</Label>
      <Label>Turn it on in iPhone Settings to add this plan. The plan works without it.</Label>
    </View>
    <Button label="Open iPhone Settings" onPress={() => Linking.openSettings()} />
  </Sheet>;
}

/** The button under the answers, and the status once the plan has been added. Shown to anyone invited who hasn't declined. */
export function AddToCalendarButton({ plan, userId }: Props) {
  const { saved, ready, set } = useSaved(userId, plan.id);
  const [sheet, setSheet] = useState<'closed' | 'choose' | 'denied'>('closed');
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const close = () => setSheet('closed');
  if (!ready) return null;

  // The permission is asked here, when the person taps, and never earlier.
  async function open() {
    if ((await askAccess()) !== 'granted') { setSheet('denied'); return; }
    const found = await writableCalendars();
    setCalendars(found);
    setChosen(found[0]?.id ?? null);
    setSheet('choose');
  }
  async function add() {
    const calendar = calendars.find(c => c.id === chosen);
    if (!calendar) return;
    set(await addToCalendar(userId, plan, calendar));
    close();
  }

  if (saved) {
    return <View accessible accessibilityRole="summary" style={styles.info}>
      <Label><Label style={type.bodyStrong}>✓ Added to {saved.calendarTitle}.</Label> This is a one-time copy. If the time changes, this plan will ask you to update it.</Label>
    </View>;
  }
  return <View style={styles.gap}>
    <Button label="Add to calendar" variant="secondary" errorMessage={addFailed} onPress={open} />
    <Label style={styles.caption}>Adds a one-time copy to your calendar. It doesn’t change your answer.</Label>
    <DeniedSheet visible={sheet === 'denied'} onClose={close} />
    <Sheet title="Add to calendar" visible={sheet === 'choose'} onClose={close}>
      {calendars.length === 0
        ? <Label accessibilityRole="alert">No calendar on this iPhone can take new events. Make one in the Calendar app, then try again.</Label>
        : <>
          <View style={styles.chips}>
            {calendars.map(c => <Chip key={c.id} label={c.title} selected={c.id === chosen} onPress={() => setChosen(c.id)} />)}
          </View>
          <Label style={styles.caption}>The event gets the title, time, meeting point and a link back to this plan. It is a one-time copy.</Label>
          <Button label={`Add to ${calendars.find(c => c.id === chosen)?.title ?? 'calendar'}`} errorMessage={addFailed} onPress={add} />
        </>}
    </Sheet>
  </View>;
}

const stale: Record<StaleKind, string> = {
  time: 'Your calendar has the old time. Update it?',
  place: 'Your calendar has the old meeting point. Update it?',
  cancelled: 'This plan was cancelled. Your calendar still has it. Update it?',
};

/** After a time change or a cancellation: Update moves the same event. Shown next to the reconfirm banner. */
export function CalendarUpdateNotice({ plan, userId }: Props) {
  const { saved, ready, set } = useSaved(userId, plan.id);
  const [dismissed, setDismissed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [result, setResult] = useState<'replaced' | 'gone' | null>(null);
  if (!ready) return null;

  async function update() {
    try {
      const done = await updateInCalendar(userId, plan, saved!);
      set(done.saved);
      setResult(done.replaced ? 'replaced' : null);
    } catch (error) {
      if (error instanceof CalendarDenied) { setDenied(true); return; }
      if (error instanceof CalendarGone) { await clearSaved(userId, plan.id); set(null); setResult('gone'); return; }
      throw error;
    }
  }

  if (result === 'replaced') {
    return <View accessibilityRole="alert" style={styles.info}><Label>Your old event was removed, so this added a new one.</Label></View>;
  }
  if (result === 'gone') {
    return <View accessibilityRole="alert" style={styles.info}>
      <Label>That calendar is no longer on this iPhone, so your calendar copy couldn’t be updated. Use Add to calendar to add this plan again.</Label>
    </View>;
  }
  const kind = staleKind(saved, plan);
  if (!kind || dismissed) return null;
  return <View style={styles.notice}>
    <Label accessibilityRole="alert" style={type.bodyStrong}>{stale[kind]}</Label>
    <View style={styles.row}>
      <View style={styles.flex}><Button label="Update" size="small" errorMessage={updateFailed} onPress={update} /></View>
      <View style={styles.flex}><Button label="Not now" variant="secondary" size="small" onPress={async () => setDismissed(true)} /></View>
    </View>
    <DeniedSheet visible={denied} onClose={() => setDenied(false)} />
  </View>;
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flexGrow: 1, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  caption: { ...type.caption, color: color.textSecondary },
  info: { padding: space.lg, borderRadius: radius.lg, backgroundColor: color.greenSoft },
  warn: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.orangeSoft },
  notice: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
});
