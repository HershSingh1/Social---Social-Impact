import { router } from 'expo-router';
import { useAuth } from '@/features/auth';
import { MapListScreen } from '@/features/discovery/MapListScreen';

export default function DiscoverTab() {
  const { session } = useAuth();
  // Detail lives at /experience/[id] (TEC-39).
  return <MapListScreen userId={session?.user.id} onOpen={id => router.push(`/experience/${id}`)} />;
}
