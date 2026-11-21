// Frame board D: Awaiting reply, one Nudge per person. Only the organizer sees it, only while the plan is open and
// someone has not answered. The server checks the organizer and the 24-hour limit; hiding this is not the protection.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Label, Tag } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { isRecent, loadNudges, nudgePeople, refusedMessage } from './nudge';

const clock = () => Date.now();

export type Awaiting = { userId: string; name: string; avatar?: string };

export function NudgePanel({ planId, organizerName, awaiting }: { planId: string; organizerName: string; awaiting: Awaiting[] }) {
  const [nudges, setNudges] = useState<Record<string, string>>({});
  const [now, setNow] = useState(clock); // read at mount and after each nudge, so render stays pure
  const [refused, setRefused] = useState<Record<string, string>>({});
  useEffect(() => { void loadNudges(planId).then(next => { setNudges(next); setNow(clock()); }); }, [planId]);
  if (awaiting.length === 0) return null;

  async function nudge(person: Awaiting) {
    const done = await nudgePeople(planId, [person.userId]);
    const next = await loadNudges(planId);
    setNudges(next);
    setNow(clock());
    setRefused(r => {
      const { [person.userId]: _drop, ...rest } = r;
      return done.includes(person.userId) ? rest : { ...rest, [person.userId]: refusedMessage(person.name, next[person.userId]) };
    });
  }

  return <Card>
    <Label accessibilityRole="header" style={type.title2}>Awaiting reply ({awaiting.length})</Label>
    {awaiting.map(person => {
      const recent = isRecent(nudges[person.userId], now) && !refused[person.userId];
      return <View key={person.userId} style={styles.block}>
        <View style={styles.row}>
          <Avatar name={person.name} uri={person.avatar} size="sm" />
          <View style={styles.flex}>
            <Label style={type.bodyStrong}>{person.name}</Label>
            <Label style={styles.muted}>Awaiting reply</Label>
          </View>
          {recent ? <Tag label={now - Date.parse(nudges[person.userId]) < 60_000 ? 'Nudged just now' : 'Nudged'} />
            : <Button label="Nudge" accessibilityLabel={`Nudge ${person.name}`} size="small" variant="secondary"
              errorMessage="Couldn’t send the nudge. Try again." onPress={() => nudge(person)} />}
        </View>
        {refused[person.userId] && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{refused[person.userId]}</Label>}
      </View>;
    })}
    <Label style={styles.muted}>A nudge sends a notification: “{organizerName} is waiting on your answer”. You can nudge each person once every 24 hours.</Label>
  </Card>;
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  flex: { flex: 1 },
  muted: { color: color.textSecondary },
});
