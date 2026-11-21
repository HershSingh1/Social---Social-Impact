// Frame: `TEC-149 · Invite from contacts (P1-07) · draft` (design artifact Y5tCN8ATC9EHfKB71G2MwH), boards A to C.
// Contacts stay on the phone. Denied or unavailable: Copy and Share still work, so there is no dead end.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { Button, Card, Label, Sheet } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { canSendText, pickContact, sendText, type Person } from './contacts';

type Mode = 'closed' | 'preview' | 'denied';

export function InviteFromContacts({ message, code }: { message: string; code: string }) {
  const [mode, setMode] = useState<Mode>('closed');
  const [people, setPeople] = useState<Person[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [textOk, setTextOk] = useState(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (mode === 'preview') void canSendText().then(setTextOk); }, [mode]);

  const close = () => { setMode('closed'); setPeople([]); setNote(null); setCopied(false); };

  // Asked when the person taps: the iPhone's own picker, one person at a time.
  async function choose(replace = false) {
    setNote(null);
    const picked = await pickContact();
    if (picked.kind === 'denied') { setMode('denied'); return; }
    if (picked.kind === 'cancelled') return;
    if (picked.kind === 'no-number') { setNote(`${picked.name} has no phone number, so Sidequest can’t text them.`); if (mode === 'closed') setMode('preview'); return; }
    setPeople(current => (replace ? [] : current).some(p => p.key === picked.person.key) ? current : [...(replace ? [] : current), picked.person]);
    setMode('preview');
  }

  async function send() {
    const result = await sendText(people.map(p => p.number), message);
    if (result === 'cancelled') throw new Error('not_sent');
    close();
  }

  const copyCode = async () => { await Clipboard.setStringAsync(code); setCopied(true); };
  const shareMessage = async () => { await Share.share({ message }); };

  return <>
    <Button label="Invite from contacts" errorMessage="Couldn’t open your contacts. Try again." onPress={() => choose(true)} />
    <Label style={styles.muted}>Pick people from your contacts and send them the code in Messages. Contacts never leave your phone.</Label>

    <Sheet title="Invite from contacts" visible={mode === 'preview'} onClose={close}>
      <Label style={styles.overline}>TO ({people.length})</Label>
      {people.length === 0 && <Label style={styles.muted}>Nobody chosen yet.</Label>}
      {people.map(p => <View key={p.key} style={styles.person}>
        <Label style={[type.bodyStrong, styles.flex]}>{p.name}</Label>
        <Button label="Remove" accessibilityLabel={`Remove ${p.name}`} variant="text" size="small"
          onPress={async () => { setPeople(current => current.filter(x => x.key !== p.key)); }} />
      </View>)}
      <Button label="Add another person" variant="secondary" size="small" errorMessage="Couldn’t open your contacts. Try again." onPress={() => choose()} />
      {note && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{note}</Label>}
      <Card>
        <Label style={styles.overline}>MESSAGE PREVIEW</Label>
        <Label>{message}</Label>
      </Card>
      <Label style={styles.info}><Label style={type.bodyStrong}>Your contacts stay on this phone.</Label> Sidequest doesn’t upload or keep them. The message goes from your own Messages.</Label>
      {textOk ? <Button label="Send in Messages" disabled={people.length === 0} errorMessage="Didn’t send. Try again." onPress={send} />
        : <Label accessibilityRole="alert" style={type.bodyStrong}>Messages isn’t available on this device.</Label>}
      <Button label="Share another way" variant="secondary" onPress={shareMessage} />
      <Button label="Copy message" variant="text" onPress={async () => { await Clipboard.setStringAsync(message); setCopied(true); }} />
      {copied && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">Copied.</Label>}
    </Sheet>

    <Sheet title="Invite from contacts" visible={mode === 'denied'} onClose={close}>
      <Label accessibilityRole="alert" style={styles.warn}>Contacts are off for Sidequest. You can still invite with the code. To pick from your contacts, turn them on in iPhone Settings.</Label>
      <Button label="Copy code" onPress={copyCode} />
      <Button label="Share" variant="secondary" onPress={shareMessage} />
      <Button label="Open iPhone Settings" variant="text" onPress={async () => { await Linking.openSettings(); }} />
      {copied && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">Code copied.</Label>}
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  muted: { color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  info: { color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  flex: { flex: 1 },
});
