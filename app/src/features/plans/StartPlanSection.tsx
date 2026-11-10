import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Notice, OptionSheet } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { useRequireAccount } from '@/features/auth/useRequireAccount';
import { useMyGroups } from '@/features/groups/hooks';
import type { Experience } from '@/types/database';

/** "Start a plan" on Experience detail: needs an account and a group, then opens a draft for this experience. */
export function StartPlanSection({ experience }: { experience: Experience }) {
  const router = useRouter();
  const requireAccount = useRequireAccount();
  const groups = useMyGroups();
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const list = groups.data ?? [];

  const go = (groupId: string) => router.push(href(`/plan/new?experienceId=${experience.id}&groupId=${groupId}`));

  function onPress() {
    setNotice(null);
    requireAccount(`/experience/${experience.id}`, () => {
      if (list.length === 0) setNotice('Create or join a group first, then you can invite them to a plan.');
      else if (list.length === 1) go(list[0].id);
      else setSheet(true);
    });
  }

  return (
    <>
      <Button label="Start a plan" onPress={onPress} accessibilityHint="Drafts a plan for this experience that you review before sending" />
      {notice ? <Notice>{notice}</Notice> : null}
      {notice ? <Button label="Go to Friends" variant="ghost" onPress={() => router.push(href('/friends'))} /> : null}
      <OptionSheet
        visible={sheet}
        title="Which group is this for?"
        value=""
        options={list.map((g) => ({ id: g.id, label: g.name, hint: `${g.memberCount} people` }))}
        onSelect={go}
        onClose={() => setSheet(false)}
      />
    </>
  );
}
