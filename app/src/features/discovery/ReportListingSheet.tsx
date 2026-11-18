import { useState } from 'react';
import { Button, Label, Sheet, TextField } from '../../ui';
import { reportListing } from './suggestions';

export function ReportListingSheet({ experienceId, visible, onClose }: { experienceId: string; visible: boolean; onClose: () => void }) {
  const [issue, setIssue] = useState(''); const [error, setError] = useState<string>(); const [sent, setSent] = useState(false);
  function close() { setIssue(''); setError(undefined); setSent(false); onClose(); }
  async function send() {
    if (!issue.trim()) { setError('Tell us what needs updating.'); return; }
    if (issue.trim().length > 500) { setError('Use 500 characters or fewer.'); return; }
    await reportListing(experienceId, issue); setSent(true);
  }
  return <Sheet title="Report outdated info" visible={visible} onClose={close}>
    {sent ? <><Label accessibilityRole="alert">Thanks, a reviewer will check it.</Label><Button label="Done" onPress={close} /></>
      : <><Label>Tell us what changed. A team reviewer will check the listing.</Label>
        <TextField label="What needs updating?" value={issue} onChangeText={value => { setIssue(value); setError(undefined); }} error={error} multiline maxLength={501} />
        <Button label="Send report" onPress={send} errorMessage="Couldn’t send this. Your note is still here—try again." /></>}
  </Sheet>;
}
