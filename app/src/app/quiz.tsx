import { router } from 'expo-router';
import { useAuth } from '@/features/auth';
import { QuizScreen } from '@/features/quiz/QuizScreen';

// Activity quiz (P1-06, TEC-148). Offered once after the onboarding steps, and from Settings any time.
export default function QuizRoute() {
  const { session } = useAuth();
  if (!session) return null;
  return <QuizScreen userId={session.user.id} onClose={() => router.back()} onDone={() => router.replace('/discover')} />;
}
