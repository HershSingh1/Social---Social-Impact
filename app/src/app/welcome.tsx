import { router } from 'expo-router';
import { WelcomeScreen } from '@/features/auth';

export default function Welcome() {
  return <WelcomeScreen onEmail={() => router.push('/sign-in')} />;
}
