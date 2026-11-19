// P1-06 activity quiz (TEC-148, decision N6). Figma 4145:25136 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
// Answers are the same interests onboarding step 2 writes. Private to the person: only their own rows are read or
// written, nothing is shared with a group, and nothing here is logged.
import { supabase } from '../../lib/supabase';
import type { Experience } from '../discovery/useExperiences';

export type Answer = 'yes' | 'maybe' | 'no';
export type Answers = Record<string, Answer>;

/** About ten cards, one or two from each group of the 17 chips on Figma 1.4. The other chips keep their answers. */
export const QUIZ_CARDS = [
  { id: 'brunch', title: 'Brunch', description: 'Long tables, good coffee, nowhere to be', group: 'Food & drink' },
  { id: 'cocktails', title: 'Cocktails', description: 'Bars, tastings and a round for the table', group: 'Food & drink' },
  { id: 'concerts', title: 'Concerts', description: 'Shows, open mics, bands in small rooms', group: 'Music & shows' },
  { id: 'comedy', title: 'Comedy', description: 'Stand-up nights and improv', group: 'Music & shows' },
  { id: 'film', title: 'Film', description: 'Screenings, outdoor movies, cinemas with a bar', group: 'Arts & culture' },
  { id: 'hiking', title: 'Hiking', description: 'Trails and views within a short drive', group: 'Active & outdoors' },
  { id: 'kayaking', title: 'Kayaking', description: 'Paddling on Lady Bird Lake or the river', group: 'Active & outdoors' },
  { id: 'climbing', title: 'Climbing', description: 'Gyms, bouldering and guided outdoor climbs', group: 'Active & outdoors' },
  { id: 'museums', title: 'Museums', description: 'Galleries, exhibits and art walks', group: 'Arts & culture' },
  { id: 'workshops', title: 'Workshops', description: 'Clay, painting, printmaking, making things with your hands', group: 'Arts & culture' },
] as const;

/**
 * Which catalog category each interest points at. The catalog has seven categories and onboarding has seventeen chips,
 * and no team decision links them yet, so this is a default to revisit. An interest with no catalog category is not listed.
 */
export const CATEGORY_OF_INTEREST: Record<string, string> = {
  brunch: 'Food and drink', coffee: 'Food and drink', food_trucks: 'Food and drink', cocktails: 'Food and drink', dessert: 'Food and drink',
  concerts: 'Music and film', comedy: 'Music and film', theater: 'Music and film', live_jazz: 'Music and film', film: 'Music and film',
  hiking: 'Outdoors', kayaking: 'Outdoors', climbing: 'Active', pickup_sports: 'Active',
  museums: 'Art and walks', markets: 'Art and walks', workshops: 'Make something',
};

export const interestsKey = (userId: string | undefined) => ['interests', userId] as const;

/** The person's own answers (RLS returns nobody else's). */
export async function fetchInterests(): Promise<Answers> {
  const { data, error } = await supabase.from('interests').select('category, answer');
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { category: string; answer: Answer }[]).map(r => [r.category, r.answer]));
}

/**
 * set_interests replaces every row, so the old answers for cards that were not asked go back with the new ones.
 * Sent once, after the last card; a retry sends the same object and ends in the same rows.
 */
export async function saveQuiz(old: Answers, answered: Answers): Promise<Answers> {
  const merged = { ...old, ...answered };
  const { error } = await supabase.rpc('set_interests', { answers: merged });
  if (error) throw error;
  return merged;
}

export const SAVE_FAILED = (count: number) => `All ${count} are still here. Check your connection and try again.`;

/** Swipe right is Yes, left is No; a short drag answers nothing. The buttons give the same answers. */
export function swipeAnswer(dx: number, dy = 0, threshold = 80): Answer | null {
  // A mostly vertical drag is the page scrolling, not an answer.
  if (Math.abs(dy) > Math.abs(dx) / 2) return null;
  return dx >= threshold ? 'yes' : dx <= -threshold ? 'no' : null;
}

/** Catalog categories the person said Yes to at least once. Maybe and No never match. */
export function matchingCategories(answers: Answers): Set<string> {
  const found = new Set<string>();
  for (const [interest, answer] of Object.entries(answers)) {
    const category = CATEGORY_OF_INTEREST[interest];
    if (answer === 'yes' && category) found.add(category);
  }
  return found;
}

/** Matching experiences first, marked; everything else keeps its order. With no matches the list is returned as it was. */
export function withInterests(list: Experience[], answers: Answers | undefined): Experience[] {
  const matching = answers ? matchingCategories(answers) : new Set<string>();
  if (matching.size === 0) return list;
  const marked = list.map(e => matching.has(e.category) ? { ...e, matchesInterests: true } : e);
  return [...marked.filter(e => e.matchesInterests), ...marked.filter(e => !e.matchesInterests)];
}
