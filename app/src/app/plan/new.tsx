import { useLocalSearchParams } from 'expo-router';
import { PlanDraftScreen } from '@/features/plans/PlanDraftScreen';

export default function NewPlanRoute() {
  const { pickId, experienceId, groupId } = useLocalSearchParams<{ pickId?: string; experienceId?: string; groupId?: string }>();
  return <PlanDraftScreen pickId={pickId} experienceId={experienceId} groupId={groupId} />;
}
