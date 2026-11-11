import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Label, Sheet } from '@/ui';
import { space } from '@/ui/theme';
import { cancelPick, closePick, PickRefused } from './api';

const message = (error: unknown) => error instanceof PickRefused ? error.message : 'Couldn’t reach the server. Check your connection and try again.';

type Props = { pickId: string; allowClose: boolean; onDone: () => void };

/** Close now and Cancel pick, each behind a confirmation sheet (P0-09). Only the organizer is shown these. */
export function PickOrganizerActions({ pickId, allowClose, onDone }: Props) {
  const [asking, setAsking] = useState<'close' | 'cancel'>();
  const done = () => { setAsking(undefined); onDone(); };
  return <View style={styles.row}>
    {allowClose && <Button label="Close now" size="small" onPress={async () => setAsking('close')} />}
    <Button label="Cancel pick" variant="secondary" size="small" onPress={async () => setAsking('cancel')} />

    <Sheet title="Close voting now?" visible={asking === 'close'} onClose={() => setAsking(undefined)}>
      <Label>Votes can’t be changed after this. The group sees the winner right away.</Label>
      <Button label="Close voting" errorMessage={message} onPress={async () => { await closePick(pickId); done(); }} />
      <Button label="Keep voting open" variant="secondary" onPress={async () => setAsking(undefined)} />
    </Sheet>
    <Sheet title="Cancel this pick?" visible={asking === 'cancel'} onClose={() => setAsking(undefined)}>
      <Label>Nobody can vote on it any more, and the group sees that you cancelled it.</Label>
      <Button label="Cancel pick" errorMessage={message} onPress={async () => { await cancelPick(pickId); done(); }} />
      <Button label="Keep pick" variant="secondary" onPress={async () => setAsking(undefined)} />
    </Sheet>
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
