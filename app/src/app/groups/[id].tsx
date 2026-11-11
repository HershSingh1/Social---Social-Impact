import { router, useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '../../features/groups';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetailScreen groupId={id} onOpenPick={pickId => router.push(`/pick/${pickId}`)}
    onOpenPlan={planId => router.push(`/plan/${planId}`)} />;
}
