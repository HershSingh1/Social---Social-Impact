import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Empty, ErrorState, Loading } from '../../ui';
import { space } from '../../ui/theme';
import { useFilters } from './FiltersContext';
import { useDiscovery } from './useDiscovery';
import type { Experience } from './useExperiences';

export function NoMatches() {
  const { clear } = useFilters();
  return <View>
    <Empty title="Nothing matches here" description="Try a different activity or price." />
    <View style={{ paddingHorizontal: space.lg }}><Button label="Clear filters" variant="secondary" onPress={clear} /></View>
  </View>;
}

const LOAD_ERROR = 'Couldn’t load experiences. Check your connection and try again.';

// Loading, Empty, Error and Ready for the experience list. The Map and List both render their own view of the
// filtered experiences through `children`. A failed refresh keeps the experiences already on screen.
export function DiscoveryResults({ children }: { children: (experiences: Experience[]) => ReactNode }) {
  const { query, results } = useDiscovery();
  const retry = async () => { await query.refetch(); };
  if (!results) {
    return query.isError ? <ErrorState message={LOAD_ERROR} onRetry={retry} /> : <Loading label="Loading experiences…" />;
  }
  return <>
    {query.isError && <ErrorState message={LOAD_ERROR} onRetry={retry} />}
    {query.data?.length === 0 ? <Empty title="No experiences yet" description="Check back soon." />
      : results.length === 0 ? <NoMatches /> : children(results)}
  </>;
}
