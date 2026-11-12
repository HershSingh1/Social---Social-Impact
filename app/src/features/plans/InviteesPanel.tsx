import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Chip, Empty, ErrorState, Label, Loading, Sheet } from '../../ui';
import { space, type } from '../../ui/theme';
import { addInvitees, createLink, fetchAddable, INVITE_ERRORS, InviteRefused, planLinkUrl, removeInvitee, revokeLink } from './invites';
import { planKey, type Plan } from './plan';

const refusal = (fallback: string) => (error: unknown) => error instanceof InviteRefused ? INVITE_ERRORS[error.code] : fallback;
type Open = 'add' | 'remove' | 'stop' | null;

// Organizer's invite tools (P0-13): share one link for this plan, add people from the group, remove people.
// The server checks the organizer on every call; hiding this panel is not the protection.
/** `readAt` is when the plan was last read: a plan that ended by then shows no invite tools. */
export function InviteesPanel({ plan, readAt }: { plan: Plan; readAt: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const ended = new Date(plan.current.endAt).getTime() <= readAt;
  const invitedIds = plan.invitees.map(i => i.userId);
  const others = plan.invitees.filter(i => !i.isOrganizer);
  const refresh = () => queryClient.invalidateQueries({ queryKey: planKey(plan.id) });
  const close = () => { setOpen(null); setPicked([]); };

  const addable = useQuery({ queryKey: ['plan-addable', plan.id, invitedIds.join(',')], enabled: open === 'add' && Boolean(plan.groupId),
    queryFn: () => fetchAddable(plan.groupId!, invitedIds) });

  if (plan.state !== 'sent' || ended) return null;

  async function share() {
    const url = planLinkUrl(await createLink(plan.id));
    await Share.share({ message: `Join my plan, ${plan.name}: ${url}` });
  }

  return <Card>
    <Label accessibilityRole="header" style={type.title2}>Invite more people</Label>
    <Label>Share a link for this plan, or add people from your group. A link adds someone to this plan only, not to the group.</Label>
    <View style={styles.buttons}>
      <Button label="Share invite link" variant="secondary" onPress={share}
        errorMessage={refusal('Couldn’t make the link. Check your connection and try again.')} />
      <Button label="Turn off invite link" variant="secondary" onPress={() => setOpen('stop')} />
      <Button label="Add people from the group" variant="secondary" onPress={() => setOpen('add')} />
      {others.length > 0 && <Button label="Remove people" variant="secondary" onPress={() => setOpen('remove')} />}
    </View>

    <Sheet title="Turn off invite link" visible={open === 'stop'} onClose={close}>
      <Label>Nobody new can join with the link. People already in the plan stay in. You can share a new link later.</Label>
      <Button label="Turn off link" onPress={async () => { await revokeLink(plan.id); close(); }}
        errorMessage={refusal('Couldn’t turn off the link. Check your connection and try again.')} />
      <Button label="Keep link on" variant="secondary" onPress={close} />
    </Sheet>

    <Sheet title="Add people" visible={open === 'add'} onClose={close}>
      {addable.isPending ? <Loading label="Loading your group…" />
        : addable.isError ? <ErrorState message="Couldn’t load your group. Check your connection and try again." onRetry={() => { void addable.refetch(); }} />
        : addable.data!.length === 0 ? <Empty title="Everyone is already invited" description="Share the invite link to bring in someone outside the group." />
        : <>
          <Label>Pick who to invite. They start as Awaiting reply.</Label>
          <View style={styles.chips}>
            {addable.data!.map(person => <Chip key={person.userId} label={person.name} selected={picked.includes(person.userId)}
              onPress={() => setPicked(p => p.includes(person.userId) ? p.filter(id => id !== person.userId) : [...p, person.userId])} />)}
          </View>
          <Button label={picked.length ? `Add ${picked.length}` : 'Add'} disabled={picked.length === 0}
            errorMessage={refusal('Couldn’t add them. Check your connection and try again.')}
            onPress={async () => { await addInvitees(plan.id, picked); await refresh(); close(); }} />
        </>}
    </Sheet>

    <Sheet title="Remove people" visible={open === 'remove'} onClose={close}>
      <Label>They lose access to the plan and leave the counts. You can add them back later.</Label>
      {others.map(person => <View key={person.userId} style={styles.person}>
        <Avatar name={person.name} size="sm" />
        <Label style={styles.name}>{person.name}</Label>
        <Button label="Remove" accessibilityLabel={`Remove ${person.name}`} variant="secondary" size="small"
          errorMessage={refusal('Couldn’t remove them. Check your connection and try again.')}
          onPress={async () => { await removeInvitee(plan.id, person.userId); await refresh(); }} />
      </View>)}
      {others.length === 0 && <Empty title="Nobody to remove" description="You’re the only one invited." />}
    </Sheet>
  </Card>;
}

const styles = StyleSheet.create({
  buttons: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1 },
});
