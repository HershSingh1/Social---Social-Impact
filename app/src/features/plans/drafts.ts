import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { DRAFT_KEY_PREFIX, type PlanDraft } from './draft';

export type DraftItem = {
  key: string; groupId: string; experienceId: string; pickId?: string;
  experienceName: string; groupName: string; startAt: string;
};

/** Drafts are plain JSON written by the plan screen; anything that does not look like one is ignored. */
function readDraft(raw: string | null): PlanDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<PlanDraft>;
    return typeof d.groupId === 'string' && typeof d.experienceId === 'string' && typeof d.start === 'string'
      && typeof d.clientKey === 'string' ? d as PlanDraft : null;
  } catch { return null; }
}

/**
 * The plan drafts saved on this phone (decision C2: they never reach the server). Only drafts whose group the
 * signed-in person can read are listed, so a draft left by someone else who used this phone stays hidden.
 * Reads the group and activity names; RLS decides what comes back.
 */
export async function loadSavedDrafts(): Promise<DraftItem[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(DRAFT_KEY_PREFIX));
  if (keys.length === 0) return [];
  const stored = await AsyncStorage.multiGet(keys);
  const drafts = stored.flatMap(([key, raw]) => { const d = readDraft(raw); return d ? [{ key, d }] : []; });
  if (drafts.length === 0) return [];
  const [groups, experiences] = await Promise.all([
    supabase.from('groups').select('id, name').in('id', [...new Set(drafts.map(x => x.d.groupId))]),
    supabase.from('experiences').select('id, name').in('id', [...new Set(drafts.map(x => x.d.experienceId))]),
  ]);
  if (groups.error) throw groups.error;
  if (experiences.error) throw experiences.error;
  const groupName = new Map(((groups.data ?? []) as { id: string; name: string }[]).map(g => [g.id, g.name]));
  const experienceName = new Map(((experiences.data ?? []) as { id: string; name: string }[]).map(e => [e.id, e.name]));
  return drafts.flatMap(({ key, d }) => {
    const group = groupName.get(d.groupId);
    const experience = experienceName.get(d.experienceId);
    return group && experience ? [{ key, groupId: d.groupId, experienceId: d.experienceId, pickId: d.pickId,
      experienceName: experience, groupName: group, startAt: d.start }] : [];
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

/** Where tapping a draft goes: the plan screen reopens the saved draft for this activity and group. */
export const draftHref = (d: Pick<DraftItem, 'groupId' | 'experienceId' | 'pickId'>) =>
  `/plan/new?group=${d.groupId}&experience=${d.experienceId}${d.pickId ? `&pick=${d.pickId}` : ''}`;
