import { router, useLocalSearchParams } from 'expo-router';
import { JoinScreen } from '@/features/groups';

// sidequest://join/CODE opens the preview. Signed out, the auth gate keeps the link and opens it after sign-in.
export default function JoinCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinScreen initialCode={code} onBack={() => router.replace('/')}
    onJoined={id => router.replace(`/groups/${id}`)} />;
}
