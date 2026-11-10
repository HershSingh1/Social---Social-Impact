import { useLocalSearchParams } from 'expo-router';
import { ExperienceDetailScreen } from '@/features/discovery/ExperienceDetailScreen';

export default function ExperienceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExperienceDetailScreen id={id} />;
}
