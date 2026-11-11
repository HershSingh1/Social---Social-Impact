import { router } from 'expo-router';
import { useAuth } from '@/features/auth';
import { FriendsScreen } from '@/features/groups';

export default function FriendsTab() {
  const { session } = useAuth();
  if (!session) return null; // the auth gate keeps signed-out people off this tab
  return <FriendsScreen userId={session.user.id} onCreate={() => router.push('/groups/new')}
    onJoin={() => router.push('/join')} onOpenGroup={id => router.push(`/groups/${id}`)} />;
}
