import { router } from 'expo-router';
import { JoinScreen } from '@/features/groups';
import { offerNotifications } from '@/features/notifications';

export default function JoinRoute() {
  return <JoinScreen onBack={() => router.back()} onJoined={id => { router.replace(`/groups/${id}`); offerNotifications(); }} />;
}
