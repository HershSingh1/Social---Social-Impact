import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DateFilter } from './dates';
import { DEFAULT_FILTERS, type ActivityFilter, type Filters, type PriceFilterId } from './filters';

type FiltersValue = {
  filters: Filters;
  setActivity: (activity: ActivityFilter) => void;
  setPrice: (price: PriceFilterId) => void;
  setDate: (date: DateFilter) => void;
  setIncludeUnknownPrices: (includeUnknownPrices: boolean) => void;
  clear: () => void;
};

const FiltersContext = createContext<FiltersValue | null>(null);

// One filter state for the whole Discover area, so the Map and the List always agree. It lives only in memory.
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const setActivity = useCallback((activity: ActivityFilter) => setFilters(current => ({ ...current, activity })), []);
  const setPrice = useCallback((price: PriceFilterId) => setFilters(current => ({ ...current, price })), []);
  const setDate = useCallback((date: DateFilter) => setFilters(current => ({ ...current, date })), []);
  const setIncludeUnknownPrices = useCallback(
    (includeUnknownPrices: boolean) => setFilters(current => ({ ...current, includeUnknownPrices })), []);
  const clear = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const value = useMemo(() => ({ filters, setActivity, setPrice, setDate, setIncludeUnknownPrices, clear }),
    [filters, setActivity, setPrice, setDate, setIncludeUnknownPrices, clear]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersValue {
  const value = useContext(FiltersContext);
  if (!value) throw new Error('useFilters must be used inside FiltersProvider');
  return value;
}
