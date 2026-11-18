import { supabase } from '@/lib/supabase';

export type AvailabilityAnswer = 'free' | 'busy';
export type OptionAvailability = { free: number; busy: number; myAnswer: AvailabilityAnswer | null };

export async function fetchAvailability(optionIds: string[], viewerId: string): Promise<Record<string, OptionAvailability>> {
  if (!optionIds.length) return {};

  const [tallies, answers] = await Promise.all([
    supabase.from('availability_tallies').select('option_id,free,busy').in('option_id', optionIds),
    supabase.from('availability').select('option_id,status').eq('user_id', viewerId).in('option_id', optionIds),
  ]);
  if (tallies.error) throw new Error(tallies.error.message);
  if (answers.error) throw new Error(answers.error.message);

  const byOption = new Map(answers.data.map(answer => [answer.option_id, answer.status as AvailabilityAnswer]));
  return Object.fromEntries(tallies.data.map(({ option_id, free, busy }) => [option_id, {
    free, busy, myAnswer: byOption.get(option_id) ?? null,
  }]));
}

export async function setAvailability(optionId: string, answer: AvailabilityAnswer | null) {
  const { error } = await supabase.rpc('set_availability', { option_id: optionId, status: answer });
  if (error) throw new Error(error.message);
}
