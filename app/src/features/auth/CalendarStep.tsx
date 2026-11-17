// Figma: 28:3178 1.5 Calendar & Permissions (file MkYNxuYFuktTR0yGExJnK7)
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Button, Card, Label, Tag } from '../../ui';
import { color, radius, size, space, type } from '../../ui/theme';
import { requestCalendarAccess } from './onboarding';
import { OnboardingFrame } from './OnboardingFrame';

type IconName = 'calendar-blank-outline' | 'map-marker-outline' | 'bell-outline';
type Props = { onBack: () => void; onFinish: () => Promise<void> };

function IconTile({ name }: { name: IconName }) {
  return <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <MaterialCommunityIcons name={name} size={size.tabIcon} color={color.orangeInk} />
  </View>;
}

// Nothing here asks the system for anything until a button is tapped (rule 6), and Finish works either way (F8).
// Both calendar rows read the phone's calendars, so one tap on either Connect asks iOS once. What a connected
// calendar is used for comes with P1-02. Location and Notifications are asked for where they are used.
export function CalendarStep({ onBack, onFinish }: Props) {
  const [connected, setConnected] = useState(false);
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);

  async function connect() {
    if (!(await requestCalendarAccess())) throw new Error('calendar_denied');
    setConnected(true);
  }
  const calendar = (title: string, detail: string) => <View style={styles.row}>
    <IconTile name="calendar-blank-outline" />
    <View style={styles.text}><Label style={type.bodyStrong}>{title}</Label><Label style={styles.secondary}>{detail}</Label></View>
    {connected ? <Tag label="Connected" variant="dark" />
      : <Button label="Connect" accessibilityLabel={`Connect ${title}`} variant="secondary" size="small" onPress={connect}
        errorMessage="Calendar access wasn’t allowed. You can still finish setup." />}
  </View>;
  const permission = (icon: IconName, title: string, detail: string, value: boolean, onChange: (next: boolean) => void) => <View style={styles.row}>
    <IconTile name={icon} />
    <View style={styles.text}><Label style={type.bodyStrong}>{title}</Label><Label style={styles.secondary}>{detail}</Label></View>
    <Switch value={value} onValueChange={onChange} accessibilityLabel={title}
      trackColor={{ true: color.primary, false: color.lineStrong }} />
  </View>;

  return <OnboardingFrame step={3} title="Connect your calendar" onBack={onBack}
    subtitle="We only read when you’re busy — never event details — so groups can find times that work."
    footer={<View style={styles.footer}>
      <Button label="Finish setup" onPress={onFinish} errorMessage="Couldn’t finish setup. Check your connection and try again." />
      <Button label="Skip for now" variant="text" onPress={onFinish} />
    </View>}>
    <Card>
      {calendar('Google Calendar', 'Reads Google calendars on this device')}
      <View style={styles.divider} />
      {calendar('Apple Calendar', 'Reads calendars on this device')}
    </Card>
    <Card>
      <Label style={styles.overline}>PERMISSIONS</Label>
      {permission('map-marker-outline', 'Location', 'Show events and places near you', location, setLocation)}
      {permission('bell-outline', 'Notifications', 'Invites, RSVP reminders, plan confirmations', notifications, setNotifications)}
    </Card>
  </OnboardingFrame>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  text: { flex: 1, minWidth: 120, gap: space.xxs },
  secondary: { ...type.caption, color: color.textSecondary },
  overline: { ...type.overline, color: color.textSecondary },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  tile: { width: size.iconTile, height: size.iconTile, borderRadius: radius.sm, backgroundColor: color.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: space.xs },
});
