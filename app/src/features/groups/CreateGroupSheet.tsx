import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Button, Label, Sheet, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { createGroup, formatCode, GroupError, shareText, spokenCode, validateGroupName, type CreatedGroup } from './api';

type Props = { visible: boolean; onClose: () => void; onViewGroup: (groupId: string) => void };

const failureMessage = (error: unknown) =>
  error instanceof GroupError && error.code === 'group_limit_reached'
    ? 'You are in 20 groups already. Leave one to create another.'
    : 'Couldn’t create the group. Check your connection and try again.';

export function CreateGroupSheet({ visible, onClose, onViewGroup }: Props) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [created, setCreated] = useState<{ groupName: string; group: CreatedGroup }>();
  const [copied, setCopied] = useState(false);
  // One key per attempt at the same name: a retry after a dropped connection returns the same group
  // instead of making a second one (rule 3, G13). A different name is a different request.
  const attempt = useRef<{ name: string; key: string }>(undefined);

  async function create() {
    const clean = name.trim();
    const invalid = validateGroupName(name);
    setFieldError(invalid ?? undefined);
    if (invalid) return;
    if (attempt.current?.name !== clean) attempt.current = { name: clean, key: randomUUID() };
    try {
      const group = await createGroup(attempt.current.key, clean);
      setCreated({ groupName: clean, group });
    } catch (error) {
      // The name stays in the field. A name problem shows under the field; anything else under the button.
      if (error instanceof GroupError && error.code === 'invalid_group_name') setFieldError(validateGroupName(name) ?? 'Enter a group name of 1 to 50 characters.');
      else throw error;
    }
  }

  if (created) {
    const { groupName, group } = created;
    return <Sheet title="Group created" visible={visible} onClose={onClose}>
      <Label>Share this code with friends so they can join {groupName}.</Label>
      <View style={styles.codeBox}>
        <Label style={styles.caption}>Group code</Label>
        <Label accessibilityLabel={`Group code ${spokenCode(group.code)}`} style={type.title1}>{formatCode(group.code)}</Label>
        <Label style={styles.caption}>Valid for 14 days.</Label>
      </View>
      <View style={styles.actions}>
        <Button label="Copy" accessibilityLabel="Copy group code" variant="secondary" size="small"
          onPress={async () => { await Clipboard.setStringAsync(group.code); setCopied(true); }} />
        <Button label="Share" accessibilityLabel="Share group code" size="small"
          onPress={async () => { await Share.share({ message: shareText(groupName, group.code) }); }} />
      </View>
      {copied && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">Code copied.</Label>}
      <Button label="View group" variant="secondary" onPress={() => onViewGroup(group.groupId)} />
    </Sheet>;
  }

  return <Sheet title="New group" visible={visible} onClose={onClose}>
    <TextField label="Group name" value={name} onChangeText={setName} error={fieldError}
      autoCapitalize="words" returnKeyType="done" placeholder="Friday Crew" />
    <Button label="Create group" onPress={create} errorMessage={failureMessage} />
  </Sheet>;
}

const styles = StyleSheet.create({
  codeBox: { gap: space.xs },
  caption: { ...type.caption, color: color.textSecondary },
  actions: { flexDirection: 'row', gap: space.sm },
});
