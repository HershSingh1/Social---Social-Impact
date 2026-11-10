import { Pressable, StyleSheet, View } from 'react-native';
import { Tag, Text, MIN_TAP, radius, space, useColors } from '@/shared/ui';
import { dayParts, formatTimeRange, formatWhen } from '@/shared/lib/time';
import type { HubPick, HubPlan } from './hub';
import { STATUS_LABEL, STATUS_TONE } from './rsvp';

export const PICK_TITLE = 'What should we do this weekend?';

function planTag(p: HubPlan): { label: string; tone: 'success' | 'neutral' | 'danger' | 'warn' } {
  if (p.state === 'cancelled') return { label: 'Cancelled', tone: 'danger' };
  if (p.isOrganizer) return { label: 'Going, organizer', tone: 'success' };
  if (p.status === 'awaiting') return { label: 'Awaiting your response', tone: 'warn' };
  return { label: STATUS_LABEL[p.status], tone: STATUS_TONE[p.status] };
}

/** One row per plan: date block, activity, time range, group and the viewer's status in words. */
export function PlanRow({ plan, onPress }: { plan: HubPlan; onPress: () => void }) {
  const tag = planTag(plan);
  const { dow, day } = dayParts(plan.startAt);
  const when = formatTimeRange(plan.startAt, plan.endAt);
  return (
    <Row
      block={[dow, day]} title={plan.experienceName} sub={`${when}, ${plan.groupName}`} tag={tag}
      muted={plan.state === 'cancelled'} label={`${plan.experienceName}, ${dow} ${day}, ${when}, ${plan.groupName}, ${tag.label}`} onPress={onPress}
    />
  );
}

export function PickRow({ pick, onPress }: { pick: HubPick; onPress: () => void }) {
  const tag = pick.state === 'open'
    ? (pick.voted ? { label: 'You voted', tone: 'success' as const } : { label: 'Vote needed', tone: 'warn' as const })
    : { label: pick.winnerName ? 'Winner picked' : 'Waiting for the organizer', tone: pick.winnerName ? ('success' as const) : ('neutral' as const) };
  const sub = pick.state === 'open'
    ? `Closes ${formatWhen(pick.deadline)}, ${pick.groupName}`
    : `Closed. ${pick.winnerName ? `${pick.winnerName} won.` : 'No option chosen yet.'} ${pick.groupName}`;
  return (
    <Row
      block={['Pick', String(pick.optionCount)]} title={PICK_TITLE} sub={sub} tag={tag}
      label={`Group pick, ${pick.groupName}, ${pick.optionCount} options, ${sub}, ${tag.label}`} onPress={onPress}
    />
  );
}

function Row({ block, title, sub, tag, muted, label, onPress }: {
  block: [string, string]; title: string; sub: string; tag: { label: string; tone: 'success' | 'neutral' | 'danger' | 'warn' };
  muted?: boolean; label: string; onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : muted ? 0.7 : 1 }]}
    >
      <View style={[styles.block, { backgroundColor: c.primarySoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="caption" color={c.primary}>{block[0]}</Text>
        <Text variant="heading" color={c.primary}>{block[1]}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="small" muted>{sub}</Text>
        <Tag label={tag.label} tone={tag.tone} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.md, borderWidth: 1, borderRadius: radius.lg, minHeight: MIN_TAP * 2 },
  block: { width: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingVertical: space.sm },
});
