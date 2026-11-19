// Figma 4145:29393, boards D and the building step of C and E: Plan again builds a draft from today's catalog, then opens it.
// Nothing is created on the server. If the activity isn't listed any more, three similar ones are offered.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { priceLabel } from '../discovery/search';
import { useExperiences } from '../discovery/useExperiences';
import { againKey, fetchListing, loadAgain, similarListings, startAgain, type AgainSource } from './again';

type Props = { planId: string; viewerId: string; reminder?: boolean; onReady: (href: string) => void; onClose: () => void };

export function PlanAgainScreen({ planId, viewerId, reminder = false, onReady, onClose }: Props) {
  const query = useQuery({ queryKey: [...againKey(planId), reminder], queryFn: () => loadAgain(planId, viewerId, reminder),
    gcTime: 0, staleTime: 0, retry: false });
  const result = query.data;
  // Once: the route re-renders with a new callback each time, and replacing the screen twice would stack two drafts.
  const opened = useRef(false);
  useEffect(() => {
    if (result?.kind !== 'ready' || opened.current) return;
    opened.current = true;
    onReady(result.href);
  }, [result, onReady]);

  if (!result) return <Screen>{query.isError
    ? <ErrorState message="Couldn’t get today’s price and hours. Nothing was created. Check your connection and try again." onRetry={async () => { await query.refetch(); }} />
    : <Loading label="Getting today’s price and hours…" />}</Screen>;
  if (result.kind === 'ready') return <Screen><Loading label="Getting today’s price and hours…" /></Screen>;
  return <Removed src={result} viewerId={viewerId} onReady={onReady} onClose={onClose} />;
}

function Removed({ src, viewerId, onReady, onClose }: { src: AgainSource; viewerId: string; onReady: (href: string) => void; onClose: () => void }) {
  const catalog = useExperiences();
  const similar = catalog.data ? similarListings(catalog.data, src.plan.current.price, src.plan.experienceId) : [];
  return <Screen>
    <Label accessibilityRole="alert" style={styles.warn}>{src.plan.name} isn’t listed any more. Pick a similar activity to keep planning.</Label>
    {catalog.isPending ? <Loading label="Finding similar activities…" />
      : !catalog.data ? <ErrorState message="Couldn’t load similar activities." onRetry={async () => { await catalog.refetch(); }} />
        : similar.length === 0 ? <Label style={styles.caption}>No similar activities are listed right now.</Label>
          : <Card>{similar.map(e => <View key={e.id} style={styles.row}>
            <View style={styles.flex}>
              <Label style={type.bodyStrong}>{e.name}</Label>
              <Label style={styles.caption}>{e.category} · {priceLabel(e)}</Label>
            </View>
            <Button label="Choose" size="small" variant="secondary" accessibilityLabel={`Choose ${e.name}`}
              errorMessage="Couldn’t open that activity. Try again."
              onPress={async () => {
                const listing = await fetchListing(e.id);
                if (!listing) throw new Error('experience_not_found');
                onReady(await startAgain(src, listing, viewerId));
              }} />
          </View>)}</Card>}
    <Button label="Not now" variant="text" onPress={onClose} />
  </Screen>;
}

const styles = StyleSheet.create({
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: radius.sm },
  caption: { ...type.caption, color: color.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  flex: { flex: 1 },
});
