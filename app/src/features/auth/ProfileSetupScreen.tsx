// The three onboarding steps: ProfileStep (Figma 1.3, 28:3089), InterestsStep (1.4, 28:3118), CalendarStep (1.5, 28:3178).
import { useState } from 'react';
import { signOut, type ProfileInput } from './api';
import { useAuth } from './AuthProvider';
import { CalendarStep } from './CalendarStep';
import { InterestsStep, type Picks } from './InterestsStep';
import { rememberStep, type OnboardingStep } from './onboarding';
import { ProfileStep } from './ProfileStep';

// The gate keeps `needs-profile` until the last step is finished or skipped (profile setup stays required, rule D1).
// Progress is kept on the phone, so reopening the app lands on the first step that isn't done. Back only changes
// what is on screen; it never forgets progress or what was typed.
export function ProfileSetupScreen() {
  const { session, onboarding, refresh } = useAuth();
  const userId = session?.user.id;
  const [step, setStep] = useState<1 | 2 | 3>(onboarding.step === 'done' ? 3 : onboarding.step);
  const [profile, setProfile] = useState<ProfileInput>({ name: '', username: '', city: '', age: '' });
  const [picks, setPicks] = useState<Picks>({ selected: [], spend: null });

  async function advance(next: OnboardingStep) {
    if (userId) await rememberStep(userId, next);
    if (next === 'done') await refresh();
    else setStep(next);
  }

  if (step === 2) {
    return <InterestsStep initial={picks} onBack={() => setStep(1)} onSkip={() => advance(3)}
      onSaved={async saved => { setPicks(saved); await advance(3); }} />;
  }
  if (step === 3) return <CalendarStep onBack={() => setStep(2)} onFinish={() => advance('done')} />;
  return <ProfileStep initial={profile} userId={userId} onBack={() => { void signOut(); }}
    onSaved={async saved => { setProfile(saved); await advance(2); }} />;
}
