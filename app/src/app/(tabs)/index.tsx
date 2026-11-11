import { router } from 'expo-router';
import { MapListScreen } from '@/features/discovery/MapListScreen';

export default function MapTab() {
  // Detail lives at /experience/[id] (TEC-39).
  return <MapListScreen onOpen={id => router.push(`/experience/${id}`)} />;
}
