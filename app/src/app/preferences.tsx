import { useAuth } from '@/features/auth';
import { PreferencesScreen } from '@/features/feedback/PreferencesScreen';

// Private preferences (P2-03, TEC-153). Opened from Settings.
export default function PreferencesRoute() {
  const { session } = useAuth();
  if (!session) return null;
  return <PreferencesScreen userId={session.user.id} />;
}
