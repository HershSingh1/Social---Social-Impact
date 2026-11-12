import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { closesIn, formatWhen } from '../../lib/time';
import { formatCode, rosterKey, shareText, spokenCode } from './api';
import { ManageSheet, type Action } from './GroupManage';
import { MemberRow, NO_LONGER_IN_GROUP } from './GroupRosterScreen';
import {
  allowBack, fetchRemoved, leaveGroup, regenerateCode, removedKey, removeMember, revokeCode, transferOwner,
} from './manage';
import { fetchGroupExtras, groupExtrasKey, myGroupsKey } from './overview';
import { useGroupRoster } from './useGroupRoster';

type Props = {
  groupId: string;
  userId: string;
  onOpenPick: (pickId: string) => void;
  onOpenPlan: (planId: string) => void;
  /** After leaving, or from the "no longer in this group" state. */
  onBack: () => void;
};

function LinkRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} onPress={onPress} style={styles.link}>
    <Label style={type.bodyStrong}>{title}</Label>
    <Label style={styles.caption}>{detail}</Label>
  </Pressable>;
}

// Group page (Figma 2.4 Group Hub, 28:3591, cut to P0): members, join code, the open vote and the plans
// you're invited to. Ideas and Memories tabs are P0-07 and P2.
export function GroupDetailScreen({ groupId, userId, onOpenPick, onOpenPlan, onBack }: Props) {
  const queryClient = useQueryClient();
  const roster = useGroupRoster(groupId);
  const extras = useQuery({ queryKey: groupExtrasKey(groupId), queryFn: () => fetchGroupExtras(groupId), refetchInterval: 30_000 });
  // Names seen on the roster, so a person the owner just removed still shows their name under Removed.
  const knownNames = useRef(new Map<string, string>());
  useEffect(() => { for (const m of roster.data?.members ?? []) knownNames.current.set(m.userId, m.name); }, [roster.data]);
  const isOwner = !!roster.data?.members.some(m => m.userId === userId && m.isOwner);
  const removed = useQuery({ queryKey: removedKey(groupId), queryFn: () => fetchRemoved(groupId, knownNames.current), enabled: isOwner });
  const [copied, setCopied] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const retry = () => { void roster.refetch(); void extras.refetch(); };

  async function confirm(chosen: Action) {
    const refresh = () => Promise.all([rosterKey(groupId), groupExtrasKey(groupId), removedKey(groupId), myGroupsKey]
      .map(queryKey => queryClient.invalidateQueries({ queryKey })));
    switch (chosen.kind) {
      case 'revoke': await revokeCode(groupId); setNotice('Code revoked. Current members stay.'); break;
      case 'regenerate': setNotice(`New code: ${formatCode((await regenerateCode(groupId)).code)}`); break;
      case 'remove': await removeMember(groupId, chosen.member.userId); setNotice(`${chosen.member.name} was removed.`); break;
      case 'transfer': await transferOwner(groupId, chosen.member.userId); setNotice(`${chosen.member.name} is now the owner.`); break;
      case 'allow-back': await allowBack(groupId, chosen.member.userId); setNotice(`${chosen.member.name} can join again with the current code.`); break;
      case 'leave': await leaveGroup(groupId); setAction(null); void queryClient.invalidateQueries({ queryKey: myGroupsKey }); onBack(); return;
      case 'manage': return;
    }
    setAction(null);
    await refresh();
  }

  if (roster.isPending || extras.isPending) return <Screen><Loading label="Loading this group…" /></Screen>;
  if (!roster.data || !extras.data) return <Screen><ErrorState message="Couldn’t load this group." onRetry={retry} /></Screen>;

  const { groupName, members } = roster.data;
  const { code, openPick, plans } = extras.data;
  // RLS returns nothing once you've left or been removed, so an empty roster means you're no longer in it.
  if (members.length === 0) return <Screen>
    <Empty title="You’re no longer in this group" description={NO_LONGER_IN_GROUP} />
    <Button label="Back to your groups" variant="secondary" onPress={onBack} />
  </Screen>;
  const name = groupName || 'Group';

  return <Screen>
    <View>
      <Label accessibilityRole="header" style={type.title1}>{name}</Label>
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
      </> : <Label style={styles.secondary}>{isOwner ? 'No active code. Make a new one when you want more people to join.' : 'No active code. The owner can make a new one.'}</Label>}
      {isOwner && <View style={styles.actions}>
        {code && <Button label="Revoke" accessibilityLabel="Revoke group code" variant="secondary" size="small"
          onPress={() => setAction({ kind: 'revoke', code: code.code })} />}
        <Button label="New code" accessibilityLabel="Make a new group code" variant="secondary" size="small"
          onPress={() => setAction({ kind: 'regenerate', code: code?.code ?? null })} />
      </View>}
    </Card>
    {notice && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{notice}</Label>}

    <Card>
      <Label accessibilityRole="header" style={type.title2}>Members</Label>
      {members.map(member => <MemberRow key={member.userId} member={member}>
        {isOwner && member.userId !== userId && <Button label="Manage" accessibilityLabel={`Manage ${member.name}`}
          variant="secondary" size="small" onPress={() => setAction({ kind: 'manage', member })} />}
      </MemberRow>)}
    </Card>

    {isOwner && !!removed.data?.length && <Card>
      <Label accessibilityRole="header" style={type.title2}>Removed</Label>
      <Label style={styles.caption}>They can’t rejoin until you allow them back.</Label>
      {removed.data.map(person => <View key={person.userId} style={styles.row}>
        <Label style={[type.bodyStrong, styles.flex]}>{person.name}</Label>
        <Button label="Allow back" accessibilityLabel={`Allow ${person.name} back`} variant="secondary" size="small"
          onPress={() => setAction({ kind: 'allow-back', member: person })} />
      </View>)}
    </Card>}

    <Button label="Leave group" accessibilityLabel={`Leave ${name}`} variant="secondary"
      onPress={() => setAction({ kind: 'leave', groupName: name, isOwner, others: members.length - 1 })} />

    <ManageSheet action={action} onClose={() => setAction(null)} onChoose={setAction} onConfirm={confirm} />
  </Screen>;
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: color.textSecondary },
  secondary: { color: color.textSecondary },
  link: { minHeight: minTap, justifyContent: 'center', gap: space.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  flex: { flex: 1 },
});
