import { router } from 'expo-router';
import { useAuth } from '@/features/auth';
import { FriendsScreen } from '@/features/groups';

// Your groups. Figma has no bar item for it (it sits on Home 2.1), so it opens from Home and goes back there.
export default function GroupsRoute() {
  const { session } = useAuth();
  if (!session) return null; // the auth gate keeps signed-out people off this screen
  return <FriendsScreen userId={session.user.id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    onCreate={() => router.push('/groups/new')}
    onJoin={() => router.push('/join')} onSettings={() => router.push('/settings')}
    onOpenGroup={id => router.push(`/groups/${id}`)} />;
}
