import { router } from 'expo-router';
import { JoinScreen } from '@/features/groups';

export default function JoinRoute() {
  return <JoinScreen onBack={() => router.back()} onJoined={id => router.replace(`/groups/${id}`)} />;
}
