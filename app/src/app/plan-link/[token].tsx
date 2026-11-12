import { router, useLocalSearchParams } from 'expo-router';
import { PlanLinkScreen } from '@/features/plans/PlanLinkScreen';

// sidequest://plan-link/TOKEN opens the preview. Signed out, the auth gate keeps the link and opens it after sign-in (D1).
export default function PlanLinkRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PlanLinkScreen token={token} onBack={() => router.replace('/')} onJoined={id => router.replace(`/plan/${id}`)} />;
}
