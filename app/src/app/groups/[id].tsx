import { useLocalSearchParams } from 'expo-router';
import { GroupRosterScreen } from '../../features/groups';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupRosterScreen groupId={id} />;
}
