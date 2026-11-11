import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { closesIn, formatWhen } from '../../lib/time';
import { formatCode, shareText, spokenCode } from './api';
import { MemberRow } from './GroupRosterScreen';
import { fetchGroupExtras, groupExtrasKey } from './overview';
import { useGroupRoster } from './useGroupRoster';

type Props = { groupId: string; onOpenPick: (pickId: string) => void; onOpenPlan: (planId: string) => void };

function LinkRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} onPress={onPress} style={styles.link}>
    <Label style={type.bodyStrong}>{title}</Label>
    <Label style={styles.caption}>{detail}</Label>
  </Pressable>;
}

// Group page (Figma 2.4 Group Hub, 28:3591, cut to P0): members, join code, the open vote and the plans
// you're invited to. Ideas and Memories tabs are P0-07 and P2.
export function GroupDetailScreen({ groupId, onOpenPick, onOpenPlan }: Props) {
  const roster = useGroupRoster(groupId);
  const extras = useQuery({ queryKey: groupExtrasKey(groupId), queryFn: () => fetchGroupExtras(groupId), refetchInterval: 30_000 });
  const [copied, setCopied] = useState(false);
  const retry = () => { void roster.refetch(); void extras.refetch(); };

  if (roster.isPending || extras.isPending) return <Screen><Loading label="Loading this group…" /></Screen>;
  if (!roster.data || !extras.data) return <Screen><ErrorState message="Couldn’t load this group." onRetry={retry} /></Screen>;

  const { groupName, members } = roster.data;
  const { code, openPick, plans } = extras.data;
  if (members.length === 0) return <Screen><Empty title="No members to show" description="You may no longer be in this group." /></Screen>;

  return <Screen>
    <View>
      <Label accessibilityRole="header" style={type.title1}>{groupName || 'Group'}</Label>
      <Label style={styles.caption}>{members.length === 1 ? '1 member' : `${members.length} members`}</Label>
    </View>
    {(roster.isError || extras.isError) && <ErrorState message="Couldn’t refresh this group. Showing what we loaded last." onRetry={retry} />}

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Group vote</Label>
      {openPick
        ? <LinkRow title={openPick.title} detail={`Open · ${closesIn(openPick.deadline)}`} onPress={() => onOpenPick(openPick.id)} />
        : <Label style={styles.secondary}>No vote open right now.</Label>}
    </Card>

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Plans</Label>
      {plans.length === 0
        ? <Label style={styles.secondary}>No upcoming plans you’re invited to.</Label>
        : plans.map(plan => <LinkRow key={plan.id} title={plan.name} detail={formatWhen(plan.startAt)} onPress={() => onOpenPlan(plan.id)} />)}
      <Label style={styles.caption}>Plans you weren’t invited to stay hidden.</Label>
    </Card>

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Join code</Label>
      {code ? <>
        <Label accessibilityLabel={`Group code ${spokenCode(code.code)}`} style={type.title1}>{formatCode(code.code)}</Label>
        <Label style={styles.caption}>Valid until {formatWhen(code.expiresAt)}</Label>
        <View style={styles.actions}>
          <Button label="Copy" accessibilityLabel="Copy group code" variant="secondary" size="small"
            onPress={async () => { await Clipboard.setStringAsync(code.code); setCopied(true); }} />
          <Button label="Share" accessibilityLabel="Share group code" size="small"
            onPress={async () => { await Share.share({ message: shareText(groupName, code.code) }); }} />
        </View>
        {copied && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">Code copied.</Label>}
      </> : <Label style={styles.secondary}>No active code. The owner can make a new one.</Label>}
    </Card>

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Members</Label>
      {members.map(member => <MemberRow key={member.userId} member={member} />)}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  secondary: { color: color.textSecondary },
  link: { minHeight: minTap, justifyContent: 'center', gap: space.xxs },
  actions: { flexDirection: 'row', gap: space.sm },
});
