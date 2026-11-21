// Frame boards D, E and F: one photo or note, with Share with group, Report and Delete, each behind its own
// confirmation. The server decides who may do what; these buttons only follow it.
import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { Button, Label, Sheet } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { albumError, deleteItem, reportItem, shareItem, type AlbumItem } from './api';

type Step = 'view' | 'share' | 'report' | 'delete';

export function ItemSheet({ item, mine, by, audience, groupName, canShare, onClose, onChanged }: {
  item: AlbumItem; mine: boolean; by: string; audience: string; groupName: string | null; canShare: boolean;
  onClose: () => void; onChanged: (notice?: string) => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>('view');
  const what = item.kind === 'photo' ? 'photo' : 'note';
  const done = (notice?: string) => async () => { await onChanged(notice); onClose(); };
  const back = () => setStep('view');
  const title = step === 'share' ? `Share with ${groupName ?? 'the group'}?` : step === 'report' ? `Report this ${what}?` : step === 'delete' ? `Delete this ${what}?` : item.kind === 'photo' ? 'Photo' : 'Note';

  return <Sheet title={title} visible onClose={onClose}>
    {step === 'view' && <>
      {item.kind === 'photo' && (item.url
        ? <Image source={{ uri: item.url }} style={styles.photo} accessibilityLabel={`Photo added by ${by}`} />
        : <Label style={styles.muted}>This photo couldn’t be loaded. Close this and try again in a moment.</Label>)}
      {item.note && <Label>{item.note}</Label>}
      <Label style={styles.muted}>Added by {by} · {audience}</Label>
      {mine && item.audience === 'plan' && canShare && <Button label="Share with group" variant="secondary" onPress={async () => setStep('share')} />}
      {mine && <Button label={`Delete ${what}`} variant="secondary" onPress={async () => setStep('delete')} />}
      {!mine && <Button label={`Report ${what}`} variant="secondary" onPress={async () => setStep('report')} />}
    </>}
    {step === 'share' && <>
      <Label style={type.body}>Current and future group members will see this {what}.</Label>
      <Label style={styles.muted}>You can delete it at any time, but it can’t be limited to this plan again.</Label>
      <Button label="Share with group" errorMessage={e => albumError(e, 'Couldn’t share it. Try again.')}
        onPress={async () => { await shareItem(item.id); await done('Shared with the group.')(); }} />
      <Button label="Keep on this plan" variant="text" onPress={async () => back()} />
    </>}
    {step === 'report' && <>
      <Label style={styles.muted}>It will be hidden for you right away, and a reviewer will check it.</Label>
      <Button label={`Report ${what}`} errorMessage={e => albumError(e, 'Couldn’t send the report. Try again.')}
        onPress={async () => { await reportItem(item.id); await done('Reported. It’s hidden for you now.')(); }} />
      <Button label="Cancel" variant="text" onPress={async () => back()} />
    </>}
    {step === 'delete' && <>
      <Label style={styles.muted}>It disappears from everyone’s phone and the album. This can’t be undone.</Label>
      <Button label={`Delete ${what}`} errorMessage={e => albumError(e, 'Couldn’t delete it. Try again.')}
        onPress={async () => { await deleteItem(item.id); await done()(); }} />
      <Button label="Keep it" variant="text" onPress={async () => back()} />
    </>}
  </Sheet>;
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 300, borderRadius: radius.lg, backgroundColor: color.surface },
  muted: { color: color.textSecondary, marginBottom: space.xxs },
});
