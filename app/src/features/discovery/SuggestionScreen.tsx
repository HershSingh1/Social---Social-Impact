// Figma: 4046:3700 PRO-15 Suggest an activity and the review queue
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth';
import { Button, Card, Chip, Empty, ErrorState, Label, Loading, Screen, Tag, TextField } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { supabase } from '../../lib/supabase';
import { chooseListingPhoto, PhotoPermissionDenied } from './listingPhoto';
import { CATEGORIES, EMPTY_SUGGESTION, SuggestionError, canReview, draftFrom, draftFromExperience, loadSubmissions, newSuggestionKey, reviewerCapabilityKey,
  submitSuggestion, validateSuggestion, type DraftErrors, type Submission, type SuggestionDraft, type SuggestionKind } from './suggestions';

const status = { pending: 'Pending review', approved: 'Approved', needs_changes: 'Needs changes', rejected: 'Not approved' } as const;
const mineKey = (id: string) => ['listing-submissions', id] as const;

const LOCAL_INTRO = 'Share a lesser-known place in Austin. A reviewer checks it before it goes on the map. It’s free to add.';
const experienceColumns = 'name,description,category,address,meeting_point,timing_kind,sessions,hours_text,duration_min,price_kind,price_min,price_max,source,image_url,origin,added_by';

export default function SuggestionScreen() {
  const { session } = useAuth(); const userId = session!.user.id; const client = useQueryClient();
  const { edit: editParam, kind: kindParam } = useLocalSearchParams<{ edit?: string; kind?: string }>();
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  const mine = useQuery({ queryKey: mineKey(userId), queryFn: () => loadSubmissions(userId) });
  const reviewer = useQuery({ queryKey: reviewerCapabilityKey(userId), queryFn: canReview });
  const [mode, setMode] = useState<'form' | 'mine'>('form');
  const [draft, setDraft] = useState<SuggestionDraft>(EMPTY_SUGGESTION);
  const [errors, setErrors] = useState<DraftErrors>({}); const [key, setKey] = useState(newSuggestionKey);
  const [resubmitting, setResubmitting] = useState<string>(); const [notice, setNotice] = useState<string>();
  const [kind, setKind] = useState<SuggestionKind>(kindParam === 'local_spot' || editParam ? 'local_spot' : 'listing');
  const [editing, setEditing] = useState<string>(); const [seenEdit, setSeenEdit] = useState<string>();
  const [photoNote, setPhotoNote] = useState<string>();
  // Editing a spot you added: the live row is the starting point, and the edit goes in as a new pending version.
  const live = useQuery({ queryKey: ['experience-edit', editId], enabled: Boolean(editId), queryFn: async () => {
    const { data, error } = await supabase.from('experiences').select(experienceColumns).eq('id', editId!).maybeSingle();
    if (error) throw error; return data as (Parameters<typeof draftFromExperience>[0] & { origin: string; added_by: string | null }) | null; } });
  if (editId && live.data && seenEdit !== editId && live.data.origin === 'local_spot' && live.data.added_by === userId) {
    setSeenEdit(editId); setEditing(editId); setKind('local_spot'); setDraft(draftFromExperience(live.data)); setErrors({}); setResubmitting(undefined); setKey(newSuggestionKey()); setMode('form');
  }
  const set = (field: keyof SuggestionDraft) => (value: string) => setDraft(d => ({ ...d, [field]: value }));

  async function send() {
    const found = validateSuggestion(draft, kind); setErrors(found); if (Object.keys(found).length) return;
    try { await submitSuggestion(draft, key, resubmitting, kind, editing); }
    catch (error) { if (error instanceof SuggestionError) { setErrors(error.fields); return; } throw error; }
    await client.invalidateQueries({ queryKey: mineKey(userId) }); setNotice('Sent for review'); setMode('mine');
    setDraft(EMPTY_SUGGESTION); setResubmitting(undefined); setEditing(undefined); setKey(newSuggestionKey());
  }
  async function pickPhoto() {
    setPhotoNote(undefined);
    try { const url = await chooseListingPhoto(userId); if (url) { setDraft(d => ({ ...d, imageUrl: url, photoConfirmed: false })); setErrors(e => ({ ...e, imageUrl: undefined, photoConfirmed: undefined })); } }
    catch (error) { if (error instanceof PhotoPermissionDenied) { setPhotoNote('Photos are off for Sidequest. Turn them on in iPhone Settings. You can still send without a photo.'); return; } throw error; }
  }
  function edit(item: Submission) { setKind(item.kind); setEditing(undefined); setDraft(draftFrom(item)); setResubmitting(item.id); setKey(newSuggestionKey()); setErrors({}); setMode('form'); }

  if (mode === 'mine') return <Screen>
    <View style={styles.titleRow}><Label accessibilityRole="header" style={type.title1}>Your suggestions</Label>
      <Button label="Add" variant="text" size="small" onPress={() => setMode('form')} /></View>
    {notice && <Label accessibilityRole="alert" style={styles.notice}>{notice}</Label>}
    {mine.isPending ? <Loading label="Loading your suggestions…" /> : mine.isError ? <ErrorState message="Couldn’t load your suggestions." onRetry={async () => { await mine.refetch(); }} />
      : !mine.data?.length ? <Empty title="No suggestions yet" description="Add an Austin activity and a reviewer will check it." />
        : mine.data.map(item => <Card key={item.id}>
          <View style={styles.titleRow}><Label style={type.bodyStrong}>{String(item.payload.name ?? 'Untitled suggestion')}</Label>
            <View style={styles.tags}>{item.kind === 'local_spot' && <Tag label="Local spot" variant="outline" />}<Tag label={status[item.state]} variant={item.state === 'approved' ? 'dark' : 'neutral'} /></View></View>
          {item.reason && <Label>Reviewer: {item.reason}</Label>}
          {item.state === 'needs_changes' && <Button label="Edit and resend" variant="secondary" size="small" onPress={() => edit(item)} />}
        </Card>)}
  </Screen>;

  const count = Object.keys(errors).length;
  return <Screen>
    <View style={styles.titleRow}><Label accessibilityRole="header" style={type.title1}>{editing ? 'Edit your local spot' : kind === 'local_spot' ? 'Add a local spot' : 'Suggest an activity'}</Label>
      <Button label="Your suggestions" variant="text" size="small" onPress={() => setMode('mine')} /></View>
    {!editing && !resubmitting && <View style={styles.chips}>
      <Chip label="An activity" selected={kind === 'listing'} onPress={() => setKind('listing')} />
      <Chip label="A local spot" selected={kind === 'local_spot'} onPress={() => setKind('local_spot')} />
    </View>}
    <Label>{kind === 'local_spot' ? LOCAL_INTRO : 'Know a spot we’re missing? A team reviewer checks every suggestion before it goes on the map.'}</Label>
    {editing && <Label style={styles.hint}>An edit becomes a new pending version. The current one stays live until a reviewer approves it.</Label>}
    {reviewer.data && <Button label="Open review queue" variant="secondary" size="small" onPress={() => router.push('/review')} />}
    {count > 0 && <Label accessibilityRole="alert" style={styles.notice}>{count} {count === 1 ? 'thing' : 'things'} to fix before you send. Everything you typed is still here.</Label>}
    {kind === 'local_spot'
      ? <View style={styles.field}><Label style={styles.fieldLabel}>Photo (optional)</Label>
        <View style={styles.row}>
          {draft.imageUrl ? <Image source={{ uri: draft.imageUrl }} style={styles.thumb} accessibilityLabel="Your photo" /> : null}
          <Button label={draft.imageUrl ? 'Change photo' : 'Choose photo'} variant="secondary" size="small" errorMessage="Couldn’t add that photo. Try another." onPress={pickPhoto} />
          {draft.imageUrl ? <Button label="Remove photo" variant="text" size="small" onPress={async () => setDraft(d => ({ ...d, imageUrl: '', photoConfirmed: false }))} /> : null}
        </View>
        {errors.imageUrl && <Label accessibilityRole="alert">{errors.imageUrl}</Label>}
        {photoNote && <><Label accessibilityRole="alert" style={styles.notice}>{photoNote}</Label>
          <Button label="Open iPhone Settings" variant="text" size="small" onPress={async () => { await Linking.openSettings(); }} /></>}
        {draft.imageUrl ? <Chip label="I may share this photo. I took it or have permission to use it."
          selected={draft.photoConfirmed} onPress={() => { setDraft(d => ({ ...d, photoConfirmed: !d.photoConfirmed })); setErrors(e => ({ ...e, photoConfirmed: undefined })); }} /> : null}
        {errors.photoConfirmed && <Label accessibilityRole="alert">{errors.photoConfirmed}</Label>}
      </View>
      : <TextField label="Photo URL (optional)" value={draft.imageUrl} onChangeText={set('imageUrl')} error={errors.imageUrl}
        placeholder="https://…" autoCapitalize="none" keyboardType="url" />}
    <TextField label="Name" value={draft.name} onChangeText={set('name')} error={errors.name} />
    <TextField label={kind === 'local_spot' ? 'What makes it special' : 'Description'} value={draft.description} onChangeText={set('description')} error={errors.description} multiline />
    <TextField label={kind === 'local_spot' ? 'Where (location or meeting point)' : 'Location or meeting point'} value={draft.location} onChangeText={set('location')} error={errors.location} />
    <View style={styles.field}><Label style={styles.fieldLabel}>Category</Label><View style={styles.chips}>{CATEGORIES.map(category =>
      <Chip key={category} label={category} selected={draft.category === category} onPress={() => set('category')(category)} />)}</View>
      {errors.category && <Label accessibilityRole="alert">{errors.category}</Label>}</View>
    <View style={styles.field}><Label style={styles.fieldLabel}>Timing</Label><View style={styles.chips}>
      {(['fixed', 'flexible'] as const).map(value => <Chip key={value} label={value === 'fixed' ? 'Fixed sessions' : 'Flexible hours'}
        selected={draft.timingKind === value} onPress={() => setDraft(d => ({ ...d, timingKind: value }))} />)}</View></View>
    {draft.timingKind === 'fixed'
      ? <TextField label="Sessions" value={draft.sessions} onChangeText={set('sessions')} error={errors.sessions} multiline
        placeholder={'2026-11-22 10:00 | 2026-11-22 12:00\nOne session per line'} />
      : <TextField label="Listed hours" value={draft.hours} onChangeText={set('hours')} error={errors.hours} placeholder="Sundays, 10 AM–2 PM" />}
    <TextField label="How long it takes (minutes)" value={draft.duration} onChangeText={set('duration')} error={errors.duration} keyboardType="number-pad" />
    <View style={styles.field}><Label style={styles.fieldLabel}>Price</Label><View style={styles.chips}>
      {(['exact', 'estimated', 'free', 'unknown'] as const).map(value => <Chip key={value} label={{ exact: 'Exact', estimated: 'Estimated', free: 'Free', unknown: 'Unknown' }[value]}
        selected={draft.priceKind === value} onPress={() => setDraft(d => ({ ...d, priceKind: value }))} />)}</View></View>
    {(draft.priceKind === 'exact' || draft.priceKind === 'estimated') && <View style={styles.row}>
      <View style={styles.flex}><TextField label="Price per person" value={draft.priceMin} onChangeText={set('priceMin')} error={errors.priceMin} keyboardType="decimal-pad" /></View>
      <View style={styles.flex}><TextField label="Maximum (optional)" value={draft.priceMax} onChangeText={set('priceMax')} error={errors.priceMax} keyboardType="decimal-pad" /></View>
    </View>}
    <TextField label="Source link" value={draft.source} onChangeText={set('source')} error={errors.source} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
    <Button label={resubmitting ? 'Resend for review' : 'Send for review'} onPress={send}
      errorMessage="Couldn’t send this. Everything you typed is still here—try again." />
  </Screen>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  notice: { ...type.callout, backgroundColor: color.orangeSoft, color: color.orangeInk, padding: space.md },
  field: { gap: space.sm }, fieldLabel: { ...type.subhead, color: color.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }, hint: { ...type.caption, color: color.textSecondary },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: color.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }, flex: { flexGrow: 1, flexBasis: 140 },
});
