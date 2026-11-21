// Frame: `TEC-152 · Shared album (P2-02) · draft`, boards A and C. "Photos and notes" on a past plan. The audience line
// is always first. A photo that fails to upload stays here as a draft, never as posted, with Retry. No public reviews (N8).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Empty, ErrorState, Label, Loading, Tag } from '../../ui';
import { color, minTap, radius, space, type } from '../../ui/theme';
import { answersKey, fetchMyAnswers } from '../outings/outings';
import { AddSheet, type NewPost } from './AddSheet';
import { albumKey, addNote, fetchAlbum, newKey, postPhoto, type AlbumItem } from './api';
import { ItemSheet } from './ItemSheet';
import type { Picked } from './photo';

type Draft = Picked & { key: string; status: 'uploading' | 'failed' };

export const audienceLine = (count: number) => `Visible to the ${count} ${count === 1 ? 'person' : 'people'} on this plan`;

export function AlbumSection({ planId, userId, invitees, groupName, hasGroup }: {
  planId: string; userId: string; invitees: { userId: string; name: string }[]; groupName: string | null; hasGroup: boolean;
}) {
  const queryClient = useQueryClient();
  const album = useQuery({ queryKey: albumKey(planId), queryFn: () => fetchAlbum(planId) });
  const went = useQuery({ queryKey: answersKey(planId, userId), queryFn: () => fetchMyAnswers(planId, userId, false) });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<AlbumItem | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  const audience = audienceLine(invitees.length);
  const nameOf = (id: string) => id === userId ? 'You' : invitees.find(i => i.userId === id)?.name ?? 'Someone';
  const canAdd = went.data?.attended === 'yes';
  const items = album.data ?? [];
  const mineCount = items.filter(i => i.userId === userId && i.kind === 'photo').length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: albumKey(planId) });
  const failed = drafts.filter(d => d.status === 'failed');

  // One draft at a time through the same steps; a failure keeps the draft (and its key) for Retry.
  async function upload(list: Draft[]) {
    if (busy.current) return;
    busy.current = true;
    try {
      for (const d of list) {
        setDrafts(cur => cur.map(x => x.key === d.key ? { ...x, status: 'uploading' } : x));
        try {
          await postPhoto(planId, d.key, d.uri, d.width, d.height);
          setDrafts(cur => cur.filter(x => x.key !== d.key));
        } catch { setDrafts(cur => cur.map(x => x.key === d.key ? { ...x, status: 'failed' } : x)); }
      }
      await refresh();
    } finally { busy.current = false; }
  }

  async function add({ photos, note }: NewPost) {
    const fresh: Draft[] = photos.map(p => ({ ...p, key: newKey(), status: 'uploading' }));
    setDrafts(cur => [...cur, ...fresh]);
    if (note) await addNote(planId, newKey(), note); // throws to the button, which shows the error and keeps the sheet
    await refresh();
    void upload(fresh);
  }

  return <Card>
    <View style={styles.header}>
      <Label accessibilityRole="header" style={type.title2}>Photos and notes</Label>
      {canAdd && <Button label="Add" accessibilityLabel="Add to the album" size="small" variant="secondary" onPress={async () => setAdding(true)} />}
    </View>
    <Label style={styles.muted}>{audience}</Label>
    {notice && <Label accessibilityRole="alert" accessibilityLiveRegion="polite" style={type.bodyStrong}>{notice}</Label>}
    {album.isPending ? <Loading label="Loading the album…" />
      : album.isError && !album.data ? <ErrorState message="Couldn’t load the album." onRetry={async () => { await album.refetch(); }} />
      : <>
        {album.isError && <ErrorState message="Couldn’t refresh the album. Showing what we loaded last." onRetry={async () => { await album.refetch(); }} />}
        {failed.length > 0 && <>
          <Label accessibilityRole="alert" style={styles.warn}>{failed.length} {failed.length === 1 ? 'photo' : 'photos'} didn’t upload. They’re saved here as drafts and aren’t posted. Nobody else can see them.</Label>
          <View style={styles.actions}>
            <Button label="Retry" size="small" onPress={async () => { void upload(failed); }} />
            <Button label="Remove drafts" size="small" variant="secondary" onPress={async () => setDrafts(cur => cur.filter(d => d.status !== 'failed'))} />
          </View>
        </>}
        {items.length === 0 && drafts.length === 0
          ? <Empty title="No photos yet" description={canAdd ? 'Add the first one.' : 'Only people who went can add photos.'} />
          : <View style={styles.grid}>
            {items.filter(i => i.kind === 'photo').map(i => <Pressable key={i.id} accessibilityRole="button" onPress={() => setOpen(i)}
              accessibilityLabel={`Photo added by ${nameOf(i.userId)}${i.audience === 'group' ? ', shared with group' : ''}`} style={styles.tileBox}>
              {i.url ? <Image source={{ uri: i.url }} style={styles.tile} accessible={false} /> : <View style={styles.tile} />}
              {i.audience === 'group' && <View style={styles.tag}><Tag label="Shared with group" variant="dark" /></View>}
            </Pressable>)}
            {drafts.map(d => <View key={d.key} style={styles.tileBox} accessible accessibilityLabel={d.status === 'failed' ? 'Photo not posted' : 'Photo uploading'}>
              <Image source={{ uri: d.uri }} style={[styles.tile, styles.dim]} accessible={false} />
              <View style={styles.tag}><Tag label={d.status === 'failed' ? 'Not posted' : 'Uploading…'} variant="outline" /></View>
            </View>)}
          </View>}
        {items.filter(i => i.kind === 'note').map(i => <Pressable key={i.id} accessibilityRole="button" onPress={() => setOpen(i)}
          accessibilityLabel={`Note from ${nameOf(i.userId)}: ${i.note}`} style={styles.note}>
          <Label style={type.bodyStrong}>{nameOf(i.userId)}</Label>
          <Label>{i.note}</Label>
          {i.userId === userId && <Label style={styles.muted}>{i.audience === 'group' ? 'Shared with group' : 'Visible to this plan'}</Label>}
        </Pressable>)}
      </>}
    <AddSheet visible={adding} audience={audience} have={mineCount} onClose={() => setAdding(false)} onAdd={add} />
    {open && <ItemSheet item={open} mine={open.userId === userId} by={nameOf(open.userId)} groupName={groupName} canShare={hasGroup}
      audience={open.audience === 'group' ? `shared with ${groupName ?? 'the group'}` : audience.toLowerCase()}
      onClose={() => setOpen(null)} onChanged={async n => { setNotice(n ?? null); await refresh(); }} />}
  </Card>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: minTap },
  muted: { color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tileBox: { width: '31%', aspectRatio: 1, minHeight: minTap },
  tile: { width: '100%', height: '100%', borderRadius: radius.sm, backgroundColor: color.surface },
  dim: { opacity: 0.55 },
  tag: { position: 'absolute', left: space.xs, bottom: space.xs },
  note: { gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: color.surface, minHeight: minTap },
});
