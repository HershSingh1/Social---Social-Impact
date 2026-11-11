import { router } from 'expo-router';
import { EmailSignInScreen } from '@/features/auth';

export default function SignIn() {
  return <EmailSignInScreen onBack={() => router.back()} />;
}
