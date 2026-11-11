import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth';
import { PlanScreen } from '@/features/plans/PlanScreen';

export default function PlanRoute() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { session } = useAuth();
  if (!session) return null;
  return <PlanScreen planId={id} viewerId={session.user.id} justSent={sent === '1'} />;
}
