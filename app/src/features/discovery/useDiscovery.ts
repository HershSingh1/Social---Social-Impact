import { useMemo } from 'react';
import { useFilters } from './FiltersContext';
import { applyFilters } from './filters';
import { useExperiences } from './useExperiences';

// What the Map and List read: the catalog, the shared filters, and the experiences that pass them.
// `results` is undefined until the first load succeeds, so a failed refresh never wipes what is on screen.
export function useDiscovery() {
  const query = useExperiences();
  const { filters } = useFilters();
  const results = useMemo(() => (query.data ? applyFilters(query.data, filters) : undefined), [query.data, filters]);
  return { query, filters, results };
}
