// Mounted once, for signed-in people. It (1) decides how a notification looks while the app is open, (2) registers
// this phone if the person already allowed notifications, (3) opens the right screen when one is tapped, and
// (4) shows the one-time "Get a heads-up?" sheet after the first join or send (frame board B).
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Label, Sheet } from '../../ui';
import { color } from '../../ui/theme';
import { onOffer } from './ask';
import { askAccess, getAccess, markOffered, wasOffered } from './device';
import { registerPhone } from './register';
import { routeFor } from './route';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export function NotificationHost({ userId }: { userId: string }) {
  const [asking, setAsking] = useState(false);
  const checking = useRef(false);

  // Already allowed: keep this phone registered (safe to repeat; the token can change).
  useEffect(() => {
    void getAccess().then(access => { if (access === 'granted') void registerPhone(); }).catch(() => undefined);
  }, [userId]);

  // A tap on a notification, whether the app was closed, in the background or open.
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    router.push(routeFor(last.notification.request.content.data) as never);
  }, [last]);

  useEffect(() => onOffer(() => {
    if (checking.current) return;
    checking.current = true;
    void (async () => {
      try {
        if (await wasOffered(userId)) return;
        if ((await getAccess()) !== 'undetermined') { await markOffered(userId); return; }
        await markOffered(userId);
        setAsking(true);
      } catch { /* not asked this time */ } finally { checking.current = false; }
    })();
  }), [userId]);

  async function turnOn() {
    const result = await askAccess();
    setAsking(false);
    if (result === 'granted') await registerPhone();
  }

  return <Sheet title="Get a heads-up?" visible={asking} onClose={() => setAsking(false)}>
    <Label style={{ color: color.textSecondary }}>Sidequest can tell you when a plan is sent to you, a vote opens or closes, or a plan changes. You choose which ones in Settings.</Label>
    <Button label="Turn on notifications" errorMessage="Couldn’t ask for notifications. You can turn them on later in Settings." onPress={turnOn} />
    <Button label="Not now" variant="text" onPress={async () => { setAsking(false); }} />
  </Sheet>;
}
