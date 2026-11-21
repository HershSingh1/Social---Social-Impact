import { useAuth } from '@/features/auth';
import { ProfileDefaultsScreen } from '@/features/auth/ProfileDefaultsScreen';

// Budget and getting around (P0-17, TEC-98). Opened from Settings until the Profile tab lands.
export default function ProfileDefaultsRoute() {
  const { session } = useAuth();
  if (!session) return null;
  return <ProfileDefaultsScreen userId={session.user.id} />;
}
