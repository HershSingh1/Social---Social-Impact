import { useLocalSearchParams } from 'expo-router';
import { PickScreen } from '@/features/picks/PickScreen';

export default function PickRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PickScreen pickId={id} />;
}
