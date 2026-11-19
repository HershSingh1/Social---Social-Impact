// Figma 4145:25677, board D: Past outings on the group page. Totals and labels only (N7).
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Card, Empty, ErrorState, Label, Loading, Tag } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { formatDay } from '../../lib/time';
import { fetchGroupHistory, groupHistoryKey, outingBadges } from './outings';

export function PastOutings({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: groupHistoryKey(groupId), queryFn: () => fetchGroupHistory(groupId) });
  if (query.isPending) return <Card><Loading label="Loading past outings…" /></Card>;
  if (!query.data) return <Card><ErrorState message="Couldn’t load past outings." onRetry={() => { void query.refetch(); }} /></Card>;

  const rows = query.data;
  const happened = rows.filter(r => r.countsAsOuting).length;
  return <Card>
    <View style={styles.header}>
      <Label accessibilityRole="header" style={type.title2}>Past outings</Label>
      {rows.length > 0 && <Label style={styles.caption}>{happened} happened</Label>}
    </View>
    {query.isError && <ErrorState message="Couldn’t refresh past outings. Showing what we loaded last." onRetry={() => { void query.refetch(); }} />}
    {rows.length === 0
      ? <Empty title="No past outings yet" description="Plans that have ended show up here." />
      : rows.map(row => {
        const badges = outingBadges(row);
        return <View key={row.planId} accessible style={styles.row}
          accessibilityLabel={`${row.name}, ${formatDay(row.startAt)}. ${badges.map(b => b.label).join(', ')}`}>
          <Label style={type.bodyStrong}>{row.name}</Label>
          <Label style={styles.caption}>{formatDay(row.startAt)}</Label>
          <View style={styles.badges}>{badges.map(b => <Tag key={b.label} label={b.label} variant={b.variant} />)}</View>
        </View>;
      })}
  </Card>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  caption: { ...type.caption, color: color.textSecondary },
  row: { gap: space.xxs, paddingVertical: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xxs },
});
