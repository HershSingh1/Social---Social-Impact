import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/features/groups/GroupDetailScreen';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetailScreen groupId={id} />;
}
