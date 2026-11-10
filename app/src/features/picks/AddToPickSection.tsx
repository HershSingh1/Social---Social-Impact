import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Notice, OptionSheet } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { messageForError } from '@/shared/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRequireAccount } from '@/features/auth/useRequireAccount';
import { useMyGroups } from '@/features/groups/hooks';
import type { Experience } from '@/types/database';
import { addOption, fetchOpenPickForGroup } from './api';
import { usePickBuilder } from './PickBuilder';
import { MAX_OPTIONS } from './ranking';

type Result = { tone: 'info' | 'success' | 'error'; text: string; action?: { label: string; to: string } };

/**
 * "Add to group pick" on Experience detail (P0-06, P0-08). Needs an account and a group. If the group already has an
 * open pick: its organizer adds the experience to it; everyone else is pointed to it (one open pick per group).
 * Otherwise the experience joins the pick being built, which is opened from the builder screen.
 */
export function AddToPickSection({ experience }: { experience: Experience }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const requireAccount = useRequireAccount();
  const groups = useMyGroups();
  const { state, dispatch } = usePickBuilder();
  const [sheet, setSheet] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const list = groups.data ?? [];

  async function addTo(groupId: string) {
    const group = list.find((g) => g.id === groupId);
    setResult(null);
    try {
      const open = await fetchOpenPickForGroup(groupId);
      if (open) {
        if (open.organizer_id === userId) {
          await addOption(open.id, experience.id);
          await qc.invalidateQueries({ queryKey: ['pick'] });
          setResult({ tone: 'success', text: `Added to ${group?.name ?? 'the group'}'s open pick. Members who already voted will see a new option.`, action: { label: 'View pick', to: `/pick/${open.id}` } });
        } else {
          setResult({ tone: 'info', text: `${group?.name ?? 'This group'} already has an open pick.`, action: { label: 'View pick', to: `/pick/${open.id}` } });
        }
        return;
      }
      const sameGroup = state.groupId === groupId;
      if (sameGroup && state.items.some((i) => i.experience.id === experience.id)) {
        setResult({ tone: 'info', text: 'Already in your group pick. Set a different start time in the pick to use it twice.', action: { label: 'Review pick', to: '/pick/new' } });
        return;
      }
      if (sameGroup && state.items.length >= MAX_OPTIONS) {
        setResult({ tone: 'error', text: `A pick can have up to ${MAX_OPTIONS} options. Remove one first.`, action: { label: 'Review pick', to: '/pick/new' } });
        return;
      }
      dispatch({ type: 'setGroup', groupId });
      dispatch({ type: 'add', item: { experience, proposedStart: null } });
      const count = (sameGroup ? state.items.length : 0) + 1;
      setResult({ tone: 'success', text: `Added to your group pick (${count} of ${MAX_OPTIONS}).`, action: { label: 'Review pick', to: '/pick/new' } });
    } catch (e) {
      setResult({ tone: 'error', text: messageForError(e) });
    }
  }

  function onPress() {
    requireAccount(`/experience/${experience.id}`, () => {
      if (list.length === 0) {
        setResult({ tone: 'info', text: 'Create or join a group first, then add experiences to its pick.', action: { label: 'Go to Friends', to: '/friends' } });
        return;
      }
      const preferred = list.find((g) => g.id === state.groupId) ?? (list.length === 1 ? list[0] : null);
      if (preferred) void addTo(preferred.id);
      else setSheet(true);
    });
  }

  return (
    <>
      <Button label="Add to group pick" variant="secondary" onPress={onPress} accessibilityHint="Adds this experience to a pick your group votes on" />
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      {result?.action ? <Button label={result.action.label} variant="ghost" onPress={() => router.push(href(result.action!.to))} /> : null}
      <OptionSheet
        visible={sheet}
        title="Which group?"
        value=""
        options={list.map((g) => ({ id: g.id, label: g.name, hint: `${g.memberCount} people` }))}
        onSelect={(id) => void addTo(id)}
        onClose={() => setSheet(false)}
      />
    </>
  );
}
