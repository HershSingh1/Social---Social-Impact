import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth';
import { PlanAgainScreen } from '@/features/plans/PlanAgainScreen';

// /plan/again?plan=…[&reminder=1]: builds a draft from today's catalog and opens it (P2-04). The "time to plan again"
// notification opens this with reminder=1.
export default function PlanAgainRoute() {
  const { plan, reminder } = useLocalSearchParams<{ plan: string; reminder?: string }>();
  const { session } = useAuth();
  if (!session) return null;
  return <PlanAgainScreen planId={plan} viewerId={session.user.id} reminder={reminder === '1'}
    onReady={href => router.replace(href as never)} onClose={() => router.back()} />;
}
