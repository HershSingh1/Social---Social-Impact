import { useRouter } from 'expo-router';
import { CreateGroupSheet } from '../../features/groups';

export default function NewGroupRoute() {
  const router = useRouter();
  return <CreateGroupSheet visible onClose={() => router.back()}
    onViewGroup={groupId => router.replace({ pathname: '/groups/[id]', params: { id: groupId } })} />;
}
