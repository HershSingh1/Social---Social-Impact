import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth';
import { PlanDraftScreen } from '@/features/plans/PlanDraftScreen';

// /plan/new?group=…&experience=…[&pick=…&start=ISO], opened by Plan this (P0-10) or Start a plan (P0-06).
export default function NewPlanRoute() {
  const { group, experience, pick, start } = useLocalSearchParams<{ group: string; experience: string; pick?: string; start?: string }>();
  const { session } = useAuth();
  if (!session) return null;
  return <PlanDraftScreen source={{ groupId: group, experienceId: experience, pickId: pick || undefined }}
    organizerId={session.user.id} proposedStart={start} onSent={id => router.replace(`/plan/${id}?sent=1`)} />;
}
