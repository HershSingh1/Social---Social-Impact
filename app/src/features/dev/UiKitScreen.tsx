import { useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Avatar, AvatarStack, Button, Card, Chip, Empty, ErrorState, Label, Loading, Screen, Sheet, Tag, TextField } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';

const swatches = Object.entries(color).filter(([, value]) => typeof value === 'string') as [string, string][];
const textStyles = Object.entries(type).filter(([name]) => name !== 'title' && name !== 'heading');

// Every color and text style from theme.ts, for checking against the Figma Style Guide on a phone.
function Tokens() {
  return <Card>
    <Label style={type.heading}>Colors</Label>
    {swatches.map(([name, value]) => <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: value, borderWidth: 1, borderColor: color.line }}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <Label>{name} {value}</Label>
    </View>)}
    <Label style={type.heading}>Text styles</Label>
    {textStyles.map(([name, style]) => <Label key={name} style={style}>{name}: The quick brown fox</Label>)}
  </Card>;
}

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
    <Label>Colors and fonts come from the Figma Style Guide. Spacing and corner radius are still provisional (Figma has no variables for them), so compare each component against the Figma Components page.</Label>
    <Label>Check at 200% system text size, with VoiceOver or TalkBack, and with the keyboard open.</Label>
    <Tokens />
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
