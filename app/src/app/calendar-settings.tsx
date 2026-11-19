import { useAuth } from '@/features/auth';
import { CalendarSettingsScreen } from '@/features/calendar/CalendarSettingsScreen';

// Settings, Calendar (P1-02, TEC-145). Opened from Settings.
export default function CalendarSettingsRoute() {
  const { session } = useAuth();
  if (!session) return null;
  return <CalendarSettingsScreen userId={session.user.id} />;
}
