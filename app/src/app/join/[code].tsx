import { useLocalSearchParams } from 'expo-router';
import { JoinFlow } from '@/features/groups/JoinFlow';

// sidequest://join/SQ7K2M lands here and goes straight to the preview.
export default function JoinWithCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinFlow initialCode={code} />;
}
