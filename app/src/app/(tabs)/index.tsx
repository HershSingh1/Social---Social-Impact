import { useAuth } from '@/features/auth';
import HomeScreen from '@/features/home/HomeScreen';

// Home tab (Figma 2.1, TEC-113).
export default function HomeTab() {
  const { session } = useAuth();
  if (!session) return null; // the auth gate keeps signed-out people off this screen
  return <HomeScreen userId={session.user.id} />;
}
