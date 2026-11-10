import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, EmptyState, ErrorState, MIN_TAP, Notice, SkeletonList, StaleBanner, Text, radius, space, useColors } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { categoryLabel, CATEGORIES } from './categories';
import { DEFAULT_FILTERS, filterExperiences, hasActiveFilters, priceFilterLabel, PRICE_OPTIONS, type Filters, type PriceFilter } from './filters';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useExperiences } from './hooks';
import { locateOnce } from './locate';
import { ExperienceList } from './ExperienceList';
import { ExperienceMap, type MapFocus } from './ExperienceMap';
import { OptionSheet } from './OptionSheet';
import { PreviewCard } from './PreviewCard';

type ViewMode = 'map' | 'list';
type Sheet = 'category' | 'price' | null;

/**
 * Home screen (P0-04, P0-05). Map and List are two views of ONE state (search, filters, selection), so switching
 * keeps everything and the list opens on the selected experience.
 */
export function DiscoveryScreen() {
  const router = useRouter();
  const c = useColors();
  const experiences = useExperiences();

  const [mode, setMode] = useState<ViewMode>('map');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [locationOn, setLocationOn] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const debounced = useDebouncedValue(query, 300);
  const results = useMemo(
    () => filterExperiences(experiences.data ?? [], filters, debounced),
    [experiences.data, filters, debounced],
  );
  // a selection that the current filters hide is not shown, but returns if the filter is relaxed
  const selected = results.find((e) => e.id === selectedId) ?? null;
  const filtered = hasActiveFilters(filters, debounced);

  const open = (id: string) => router.push(href(`/experience/${id}`));
  const clearAll = () => { setFilters(DEFAULT_FILTERS); setQuery(''); };

  async function locate() {
    setLocationNotice(null);
    const res = await locateOnce();
    if (res.status === 'granted') {
      setLocationOn(true);
      setMode('map');
      setFocus({ latitude: res.latitude, longitude: res.longitude, nonce: Date.now() });
    } else {
      // denied or unavailable: stay on downtown Austin, everything else keeps working
      setLocationNotice(res.status === 'denied'
        ? 'Location is off, so the map stays on downtown Austin. You can still search and filter.'
        : "Couldn't find your location. The map stays on downtown Austin.");
    }
  }

  function switchMode(next: ViewMode) {
    setMode(next);
    if (next === 'map' && selected) setFocus({ latitude: selected.lat, longitude: selected.lng, nonce: Date.now() });
  }

  const header = (
    <View style={styles.header}>
      <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Austin experiences"
          placeholderTextColor={c.textMuted}
          accessibilityLabel="Search Austin experiences"
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.searchInput, { color: c.text }]}
        />
        {query !== '' ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
            <Text variant="bodyStrong" muted>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chips}>
        <Chip
          label={filters.category ? categoryLabel(filters.category) : 'Activity'}
          active={filters.category !== null}
          hint="Choose an activity type"
          onPress={() => setSheet('category')}
        />
        <Chip
          label={filters.price === 'any' ? 'Price' : priceFilterLabel(filters.price)}
          active={filters.price !== 'any'}
          hint="Choose a price limit"
          onPress={() => setSheet('price')}
        />
        <Chip label="Locate me" active={locationOn} hint="Centers the map on you. Asks for location permission." onPress={locate} />
      </View>
      {locationNotice ? <Notice>{locationNotice}</Notice> : null}
    </View>
  );

  let body: React.ReactNode;
  if (experiences.data === undefined && experiences.isPending) {
    body = <View style={styles.pad}><SkeletonList rows={4} rowHeight={96} /></View>;
  } else if (experiences.data === undefined) {
    body = <ErrorState message="Couldn't load experiences near you." onRetry={() => experiences.refetch()} />;
  } else if (results.length === 0) {
    body = (
      <EmptyState
        title="Nothing matches here"
        body={filtered ? 'Try a wider price range, another activity, or clear filters.' : 'There are no experiences yet.'}
        actionLabel={filtered ? 'Clear filters' : undefined}
        onAction={filtered ? clearAll : undefined}
      />
    );
  } else if (mode === 'map') {
    body = (
      <View style={styles.fill}>
        <ExperienceMap experiences={results} selectedId={selected?.id ?? null} onSelect={setSelectedId} focus={focus} showsUserLocation={locationOn} />
      </View>
    );
  } else {
    body = (
      <ExperienceList
        experiences={results}
        selectedId={selected?.id ?? null}
        onPressItem={(id) => { setSelectedId(id); open(id); }}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: c.bg }]}>
      {header}
      {experiences.data !== undefined && experiences.isError ? <View style={styles.pad}><StaleBanner onRetry={() => experiences.refetch()} /></View> : null}
      {experiences.data !== undefined ? (
        <Text variant="small" muted style={styles.count} accessibilityLiveRegion="polite">
          {results.length} {results.length === 1 ? 'experience' : 'experiences'} in Austin
        </Text>
      ) : null}
      <View style={styles.fill}>{body}</View>

      {mode === 'map' && selected ? (
        <View style={styles.preview}><PreviewCard item={selected} onOpen={() => open(selected.id)} /></View>
      ) : null}

      <View style={styles.toggleRow} pointerEvents="box-none">
        <View style={[styles.toggle, { backgroundColor: c.card, borderColor: c.border }]} accessibilityRole="tablist">
          <ToggleButton label="Map" on={mode === 'map'} onPress={() => switchMode('map')} />
          <ToggleButton label="List" on={mode === 'list'} onPress={() => switchMode('list')} />
        </View>
      </View>

      <OptionSheet
        visible={sheet === 'category'}
        title="Activity"
        value={filters.category ?? 'any'}
        options={[{ id: 'any', label: 'Any activity' }, ...CATEGORIES.map((x) => ({ id: x.id as string, label: x.label }))]}
        onSelect={(id) => setFilters((f) => ({ ...f, category: id === 'any' ? null : (id as Filters['category']) }))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<PriceFilter>
        visible={sheet === 'price'}
        title="Price"
        value={filters.price}
        options={PRICE_OPTIONS.map((o) => ({ id: o.id, label: o.label, hint: o.id === 'u25' || o.id === 'u50' ? 'exact or estimated' : undefined }))}
        onSelect={(id) => setFilters((f) => ({ ...f, price: id }))}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Chip({ label, active, hint, onPress }: { label: string; active: boolean; hint: string; onPress: () => void | Promise<unknown> }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}, selected` : label}
      accessibilityHint={hint}
      style={[styles.chip, { backgroundColor: active ? c.primarySoft : c.card, borderColor: active ? c.primary : c.border }]}
    >
      <Text variant="small" color={active ? c.primary : c.text} style={{ fontWeight: active ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

function ToggleButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${label} view`}
      accessibilityState={{ selected: on }}
      style={[styles.toggleBtn, { backgroundColor: on ? c.primary : 'transparent' }]}
    >
      <Text variant="bodyStrong" color={on ? c.onPrimary : c.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, minHeight: MIN_TAP + 4, paddingHorizontal: space.md },
  searchInput: { flex: 1, fontSize: 16, minHeight: MIN_TAP },
  clear: { minHeight: MIN_TAP, minWidth: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: { minHeight: MIN_TAP, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  count: { paddingHorizontal: space.lg, paddingVertical: space.xs },
  preview: { position: 'absolute', left: space.lg, right: space.lg, bottom: 88 },
  toggleRow: { position: 'absolute', left: 0, right: 0, bottom: space.lg, alignItems: 'center' },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.pill, padding: 4 },
  toggleBtn: { minHeight: MIN_TAP, minWidth: 80, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
