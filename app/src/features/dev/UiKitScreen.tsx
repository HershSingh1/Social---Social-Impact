import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Avatar, AvatarStack, Button, Card, Chip, Empty, ErrorState, Label, Loading, Screen, Sheet, Tag, TextField } from '../../ui';
import { type } from '../../ui/theme';

function Gallery() {
  const [name, setName] = useState('Keep this text');
  const [selected, setSelected] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [completed, setCompleted] = useState(0);
  async function slowAction() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    setCompleted(value => value + 1);
  }
  return <Screen>
    <Label accessibilityRole="header" style={type.title}>Core UI kit</Label>
    <Label>Provisional styling. Figma tokens and fonts have not been verified.</Label>
    <Label>Check at 200% system text size, with VoiceOver or TalkBack, and with the keyboard open.</Label>
    <Card>
      <Label style={type.heading}>Buttons</Label>
      <Button label="Primary — slow action" onPress={slowAction} />
      <Label>Completed actions: {completed}</Label>
      <Button label="Secondary" variant="secondary" onPress={slowAction} />
      <Button label="Text action" variant="text" onPress={slowAction} />
      <Button label="Loading" loading onPress={() => {}} />
      <Button label="Disabled" disabled onPress={() => {}} />
      <Button label="Failed action" onPress={async () => { throw new Error('Gallery example'); }} />
    </Card>
    <TextField label="Display name" value={name} onChangeText={setName} error="Example error: your input stays in place." />
    <Chip label="Outdoors" selected={selected} onPress={() => setSelected(value => !value)} />
    <Chip label="Unavailable filter" disabled onPress={() => {}} />
    <Card>
      <Label style={type.heading}>Card, avatars and status</Label>
      <Avatar name="Alex" />
      <Avatar name="Missing image fallback" uri="https://example.invalid/missing.png" />
      <AvatarStack people={[{ id: '1', name: 'Alex' }, { id: '2', name: 'Jordan' }, { id: '3', name: 'Sam' }]} />
      <Tag label="Awaiting reply" />
      <Tag label="Booking required" />
    </Card>
    <Button label="Open sheet" onPress={() => setSheet(true)} />
    <Loading />
    <Empty title="Nothing here yet" description="Your shared plans will appear here." />
    <ErrorState message="Couldn’t refresh. Your current content stays above." onRetry={slowAction} />
    <Sheet title="Example sheet" visible={sheet} onClose={() => setSheet(false)}>
      <TextField label="Same retained input" value={name} onChangeText={setName} />
      <Label>Close with the button, Android Back, or the screen reader escape gesture.</Label>
    </Sheet>
  </Screen>;
}

export default function UiKitScreen() {
  return __DEV__ ? <Gallery /> : <Redirect href="/" />;
}
