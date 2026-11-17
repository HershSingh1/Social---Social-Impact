import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { supabase } from '../../lib/supabase';

/** Where a person is in the three steps. `done` also covers everyone who set up a profile before the steps existed. */
export type OnboardingStep = 1 | 2 | 3 | 'done';
export type OnboardingState = { step: OnboardingStep; needsUsername: boolean };

// Only the steps after the profile are remembered here. Step 1 is finished when `set_profile` has given the account a name.
const stepKey = (userId: string) => `sidequest.onboarding.${userId}`;
const askedKey = (userId: string) => `sidequest.usernameAsked.${userId}`;

export async function loadOnboarding(userId: string): Promise<OnboardingState> {
  const { data, error } = await supabase.from('profiles').select('display_name, username').eq('id', userId).maybeSingle();
  if (error) throw error;
  const row = data as { display_name: string | null; username?: string | null } | null;
  if (!row?.display_name) return { step: 1, needsUsername: false };
  const saved = await AsyncStorage.getItem(stepKey(userId));
  if (saved === '2' || saved === '3') return { step: Number(saved) as 2 | 3, needsUsername: false };
  return { step: 'done', needsUsername: !row.username };
}

/** Never moves backwards, so tapping Back and Continue again does not undo progress. */
export async function rememberStep(userId: string, step: OnboardingStep) {
  const saved = await AsyncStorage.getItem(stepKey(userId));
  if (step === 'done') await AsyncStorage.removeItem(stepKey(userId));
  else if (saved === null || Number(saved) < step) await AsyncStorage.setItem(stepKey(userId), String(step));
}

/** True the first time it is called for this account, so the username prompt for existing people shows once. */
export async function takeUsernamePrompt(userId: string): Promise<boolean> {
  if (await AsyncStorage.getItem(askedKey(userId))) return false;
  await AsyncStorage.setItem(askedKey(userId), '1');
  return true;
}

// The chips of Figma 1.4, in screen order. The ids are the categories `set_interests` accepts (TEC-115).
export const INTEREST_GROUPS = [
  { title: 'Food & drink', items: [['brunch', 'Brunch'], ['coffee', 'Coffee'], ['food_trucks', 'Food trucks'], ['cocktails', 'Cocktails'], ['dessert', 'Dessert']] },
  { title: 'Music & shows', items: [['concerts', 'Concerts'], ['comedy', 'Comedy'], ['theater', 'Theater'], ['live_jazz', 'Live jazz']] },
  { title: 'Active & outdoors', items: [['hiking', 'Hiking'], ['climbing', 'Climbing'], ['pickup_sports', 'Pickup sports'], ['kayaking', 'Kayaking']] },
  { title: 'Arts & culture', items: [['museums', 'Museums'], ['markets', 'Markets'], ['film', 'Film'], ['workshops', 'Workshops']] },
] as const;
export const MIN_INTERESTS = 3;

// Figma's Free / $ / $$ / $$$ as dollars per person for `profiles.budget_cap`. The filter's steps are Free, under $25 and
// under $50 (decision C5); $$$ is "over $50", so it is stored as $100. No team decision fixes these numbers yet.
export const SPEND_OPTIONS = [
  { label: 'Free', hint: 'Free', cap: 0 }, { label: '$', hint: 'Under $25', cap: 25 },
  { label: '$$', hint: 'Under $50', cap: 50 }, { label: '$$$', hint: 'Over $50', cap: 100 },
] as const;

export async function saveInterests(selected: string[], spendCap: number | null) {
  const answers = Object.fromEntries(selected.map(id => [id, 'yes']));
  const interests = await supabase.rpc('set_interests', { answers });
  if (interests.error) throw interests.error;
  // Only sent when they picked one: `set_profile_defaults` replaces both the cap and the transport preference.
  if (spendCap !== null) {
    const defaults = await supabase.rpc('set_profile_defaults', { budget_cap: spendCap });
    if (defaults.error) throw defaults.error;
  }
}

/** Asks iOS for calendar access. Only ever called from a button the person tapped (rule 6). Granting does nothing yet (P1-02). */
export async function requestCalendarAccess(): Promise<boolean> {
  const result = await Calendar.requestCalendarPermissions();
  return result.granted;
}
