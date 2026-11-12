import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../features/auth';
import { GroupDetailScreen } from '../../features/groups';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  if (!session) return null; // the auth gate keeps signed-out people off this screen
  return <GroupDetailScreen groupId={id} userId={session.user.id} onOpenPick={pickId => router.push(`/pick/${pickId}`)}
    onOpenPlan={planId => router.push(`/plan/${planId}`)}
    onBack={() => (router.canGoBack() ? router.back() : router.replace('/friends'))} />;
}
