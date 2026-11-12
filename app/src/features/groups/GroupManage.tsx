import { StyleSheet, View } from 'react-native';
import { Button, Label, Sheet } from '../../ui';
import { color, type } from '../../ui/theme';
import { formatCode } from './api';
import { manageMessage } from './manage';

export type Person = { userId: string; name: string };
export type Action =
  | { kind: 'revoke'; code: string }
  | { kind: 'regenerate'; code: string | null }
  | { kind: 'manage'; member: Person }
  | { kind: 'remove'; member: Person }
  | { kind: 'transfer'; member: Person }
  | { kind: 'allow-back'; member: Person }
  | { kind: 'leave'; groupName: string; isOwner: boolean; others: number };

type Copy = { title: string; body: string; confirm?: string; cancel: string };

/** Confirmation copy for each owner control and for leaving (P0-03). No `confirm` means nothing can be done yet. */
export function confirmCopy(action: Exclude<Action, { kind: 'manage' }>): Copy {
  switch (action.kind) {
    case 'revoke': return { title: `Revoke ${formatCode(action.code)}?`, cancel: 'Keep code', confirm: 'Revoke code',
      body: 'The code and its link stop working right away. Current members stay. Make a new code when you want more people to join.' };
    case 'regenerate': return { title: 'Make a new code?', cancel: 'Cancel', confirm: 'Make new code',
      body: `${action.code ? `${formatCode(action.code)} stops working right away. ` : ''}The new code works for 14 days. Current members stay.` };
    case 'remove': return { title: `Remove ${action.member.name}?`, cancel: 'Cancel', confirm: 'Remove',
      body: `${action.member.name} loses access to the members, saved ideas and open votes right away, and can’t rejoin until you allow them back. Plans they were already invited to stay.` };
    case 'transfer': return { title: `Make ${action.member.name} the owner?`, cancel: 'Cancel', confirm: 'Make owner',
      body: `${action.member.name} will manage the code and members. You stay in the group as a member.` };
    case 'allow-back': return { title: `Allow ${action.member.name} back?`, cancel: 'Cancel', confirm: 'Allow back',
      body: `${action.member.name} can join again with the group’s current code. They aren’t added back until they do.` };
    case 'leave':
      if (action.isOwner && action.others > 0) return { title: `Leave ${action.groupName}?`, cancel: 'OK',
        body: 'You’re the owner. Make someone else the owner first: tap Manage next to a member.' };
      if (action.isOwner) return { title: `Leave ${action.groupName}?`, cancel: 'Cancel', confirm: 'Leave and archive',
        body: 'You’re the only member, so the group will be archived and its code will stop working.' };
      return { title: `Leave ${action.groupName}?`, cancel: 'Cancel', confirm: 'Leave group',
        body: 'You’ll lose access to the members, saved ideas and open votes. Plans you were already invited to stay. To come back, you’ll need a new code.' };
  }
}

type Props = {
  action: Action | null;
  onClose: () => void;
  onChoose: (next: Action) => void;
  onConfirm: (action: Action) => Promise<void>;
};

// One sheet for every owner control and for leaving. A failed action keeps the sheet open with the reason
// under the button; Button blocks double taps and shows progress.
export function ManageSheet({ action, onClose, onChoose, onConfirm }: Props) {
  if (!action) return null;
  if (action.kind === 'manage') {
    const { member } = action;
    return <Sheet title={member.name} visible onClose={onClose}>
      <Button label="Make owner" accessibilityLabel={`Make ${member.name} the owner`} variant="secondary"
        onPress={() => onChoose({ kind: 'transfer', member })} />
      <Button label="Remove from group" accessibilityLabel={`Remove ${member.name} from the group`} variant="secondary"
        onPress={() => onChoose({ kind: 'remove', member })} />
    </Sheet>;
  }
  const copy = confirmCopy(action);
  return <Sheet title={copy.title} visible onClose={onClose}>
    <Label style={styles.body}>{copy.body}</Label>
    <View>
      {copy.confirm && <Button label={copy.confirm} errorMessage={manageMessage} onPress={() => onConfirm(action)} />}
      <Button label={copy.cancel} variant="text" onPress={onClose} />
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({ body: { ...type.body, color: color.textSecondary } });
