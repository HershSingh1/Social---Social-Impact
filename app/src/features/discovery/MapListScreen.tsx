// Map tab (P0-04), built from Figma 4.3 Map View (node 28:4763, file MkYNxuYFuktTR0yGExJnK7) and 4.1 Discover Feed
// (28:4626). Map and List share the same filtered results; search, filters and the selected pin are kept when
// switching between them.
import * as Location from 'expo-location';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, Empty, ErrorState, Label, Loading, Tag, TextField } from '../../ui';
import { color, minTap, radius, shadow, size, space, type } from '../../ui/theme';
import { collectionLine, seasonalIds, useCollections, type Collection } from '../bucket/collections';
import { useMyGroups } from '../groups/useMyGroups';
import { DiscoveryResults } from './DiscoveryResults';
import { FilterSheet } from './FilterBar';
import { useFilters } from './FiltersContext';
import { type AreaSearchAction, filterToRegion, INITIAL_AREA_SEARCH, updateAreaSearch } from './area';
import { chicagoToday, dateFilterLabel } from './dates';
import { countActiveFilters } from './filters';
import { CategoryRow, PlaceMarker, RoundButton } from './MapControls';
import { contextIds, EXPLORE, type MapContext, useSaves } from './saves';
import { AUSTIN, matchesSearch, priceLabel, SEARCH_DELAY_MS, timingLabel } from './search';
import { useExperiences, type Experience } from './useExperiences';

type Props = { onOpen: (experienceId: string) => void; userId?: string };
type Mode = 'map' | 'list';

function Summary({ item }: { item: Experience }) {
  return <View style={styles.summary}>
    <Label style={type.headline}>{item.name}</Label>
    <Label style={styles.caption}>{[item.category, item.area].filter(Boolean).join(' · ')}</Label>
    <Label style={styles.caption}>{priceLabel(item)} · {timingLabel(item)}</Label>
    {item.matchesInterests && <Tag label="Matches your interests" variant="dark" />}
    {item.booking_required && <Tag label="Booking required" variant="outline" />}
  </View>;
}

/** The card above the title for the selected pin; tapping it opens Detail. */
function PreviewCard({ item, onOpen }: { item: Experience; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, open details`} onPress={onOpen} style={styles.preview}>
    {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.thumb} accessible={false} /> : null}
    <Summary item={item} />
  </Pressable>;
}

function MapPane({ items, selected, area, pendingArea, top, bottom, onAreaAction, onSelect, onOpen }: {
  items: Experience[]; selected?: Experience; area?: Region; pendingArea?: Region; top: number; bottom: number;
  onAreaAction: (action: AreaSearchAction) => void;
  onSelect: (id?: string) => void; onOpen: (id: string) => void;
}) {
  const map = useRef<MapView>(null);
  const [locationNote, setLocationNote] = useState<string>();

  // Location is asked for only when Locate is tapped (rule 6). Denied keeps the map on downtown Austin.
  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocationNote('Location is off, so the map stays on downtown Austin. You can turn it on in Settings.'); return; }
    setLocationNote(undefined);
    onAreaAction({ type: 'app-move' });
    const here = await Location.getCurrentPositionAsync({});
    map.current?.animateToRegion({ ...AUSTIN, latitude: here.coords.latitude, longitude: here.coords.longitude });
  }

  return <View style={styles.flex}>
    {/* Coming back from List reopens on the searched area, so the pins match the results. */}
    <MapView ref={map} style={styles.flex} initialRegion={area ?? AUSTIN} onPress={() => onSelect(undefined)}
      onTouchStart={() => onAreaAction({ type: 'user-touch' })}
      onRegionChangeComplete={region => onAreaAction({ type: 'region-complete', region })} accessibilityLabel="Map of activities">
      {items.filter(i => i.lat !== null && i.lng !== null).map(i => <PlaceMarker key={i.id} item={i}
        selected={i.id === selected?.id} onPress={() => onSelect(i.id)} />)}
    </MapView>
    <View style={[styles.overlay, { top, bottom }]} pointerEvents="box-none">
      {pendingArea && <View style={styles.searchArea}><Button label="Search this area" size="small" onPress={() => onAreaAction({ type: 'apply' })} /></View>}
      <View style={styles.flex} pointerEvents="none" />
      {locationNote && <Label accessibilityRole="alert" style={styles.note}>{locationNote}</Label>}
      {selected && <PreviewCard item={selected} onOpen={() => onOpen(selected.id)} />}
      <View style={styles.titleRow} pointerEvents="box-none">
        <Label accessibilityRole="header" style={styles.title}>Austin.</Label>
        <RoundButton icon="navigation" label="Locate me" onPress={locate} />
      </View>
    </View>
  </View>;
}

function ListPane({ items, selectedId, top, onOpen }: { items: Experience[]; selectedId?: string; top: number; onOpen: (id: string) => void }) {
  const list = useRef<FlatList<Experience>>(null);
  const index = items.findIndex(i => i.id === selectedId);
  // Opening the List scrolls to whatever was selected on the Map.
  useEffect(() => {
    if (index > 0) requestAnimationFrame(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <FlatList ref={list} data={items} keyExtractor={i => i.id} contentContainerStyle={[styles.listContent, { paddingTop: top }]}
    onScrollToIndexFailed={({ averageItemLength }) => list.current?.scrollToOffset({ offset: averageItemLength * index, animated: false })}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onOpen(item.id)}
      accessibilityLabel={`${item.name}${item.id === selectedId ? ', selected' : ''}`}
      style={[styles.row, item.id === selectedId && styles.rowSelected]}>
      <Card><Summary item={item} /></Card>
    </Pressable>} />;
}

type ChipsProps = {
  userId?: string; context: MapContext; groups: { id: string; name: string }[]; areaApplied: boolean;
  /** Seasonal collections with something to show today (P2-05), and the one picked. */
  collections: Collection[]; collectionId?: string; onCollection: (id?: string) => void;
  onContext: (context: MapContext) => void; onClearArea: () => void;
};

// The group chips, quick filters and category circles. On the Map they sit at the bottom, on the List under the buttons.
function Chips({ userId, context, groups, areaApplied, collections, collectionId, onCollection, onContext, onClearArea }: ChipsProps) {
  const { filters, setPrice, setDate, setIncludeUnknownPrices } = useFilters();
  return <View style={styles.chipsBlock}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {userId && <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Show">
        <Chip label="Explore Austin" selected={context.kind === 'explore'} onPress={() => onContext(EXPLORE)} />
        <Chip label="My saves" selected={context.kind === 'mine'} onPress={() => onContext({ kind: 'mine' })} />
        {groups.map(group => <Chip key={group.id} label={group.name}
          selected={context.kind === 'group' && context.groupId === group.id}
          onPress={() => onContext({ kind: 'group', groupId: group.id })} />)}
      </View>}
      <Chip label="Free" selected={filters.price === 'free'} onPress={() => setPrice(filters.price === 'free' ? 'any' : 'free')} />
      <Chip label="Under $25" selected={filters.price === 'under25'} onPress={() => setPrice(filters.price === 'under25' ? 'any' : 'under25')} />
      {filters.date !== 'any' && <Chip label={dateFilterLabel(filters.date)} selected onPress={() => setDate('any')} />}
      {!filters.includeUnknownPrices && <Chip label="Known prices only" selected onPress={() => setIncludeUnknownPrices(true)} />}
      {areaApplied && <Chip label="In this area" selected onPress={onClearArea} />}
      {collections.map(c => <Chip key={c.id} label={c.name} selected={collectionId === c.id}
        onPress={() => onCollection(collectionId === c.id ? undefined : c.id)} />)}
    </ScrollView>
    {collections.filter(c => c.id === collectionId).map(c => <Label key={c.id} accessibilityLiveRegion="polite" style={styles.collectionLine}>{collectionLine(c)}</Label>)}
    <CategoryRow />
  </View>;
}

export function MapListScreen({ onOpen, userId }: Props) {
  const [mode, setMode] = useState<Mode>('map');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [context, setContext] = useState<MapContext>(EXPLORE);
  const [collectionId, setCollectionId] = useState<string>();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [chipsHeight, setChipsHeight] = useState(0);
  const { top } = useSafeAreaInsets();
  const { filters } = useFilters();
  const saves = useSaves(userId);
  const groups = useMyGroups(userId);
  const groupList = groups.data ?? [];
  // A group you left, or that was archived, drops out of the chips; fall back to the whole catalog.
  const activeContext: MapContext = context.kind === 'group' && groups.data && !groupList.some(g => g.id === context.groupId) ? EXPLORE : context;
  const contextAllowed = userId && saves.data ? contextIds(saves.data, userId, activeContext) : null;
  // Seasonal collections (P2-05): in season only, so one disappears after its end date with no app update.
  const catalog = useExperiences().data;
  const collections = useCollections();
  const today = chicagoToday();
  const seasonal = useMemo(() => (collections.data ?? [])
    .map(collection => ({ collection, ids: seasonalIds(collection, catalog ?? [], today) })).filter(s => s.ids.size > 0),
  [collections.data, catalog, today]);
  const activeCollection = seasonal.find(s => s.collection.id === collectionId);
  const allowed = activeCollection
    ? (contextAllowed ? new Set([...contextAllowed].filter(id => activeCollection.ids.has(id))) : activeCollection.ids)
    : contextAllowed;
  const contextName = activeContext.kind === 'mine' ? 'My saves'
    : activeContext.kind === 'group' ? groupList.find(g => g.id === activeContext.groupId)?.name ?? 'this group' : '';
  const [areaSearch, dispatchArea] = useReducer(updateAreaSearch, INITIAL_AREA_SEARCH);
  const active = countActiveFilters(filters);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const chips = <Chips userId={userId} context={activeContext} groups={groupList} areaApplied={!!areaSearch.applied}
    collections={seasonal.map(s => s.collection)} collectionId={activeCollection?.collection.id} onCollection={setCollectionId}
    onContext={setContext} onClearArea={() => dispatchArea({ type: 'clear' })} />;

  return <View style={styles.screen}>
    <View style={styles.flex}>
      {activeContext.kind !== 'explore' && !saves.data
        ? <View style={{ paddingTop: headerHeight }}>{saves.isError
          ? <ErrorState message="Couldn’t load saved ideas." onRetry={async () => { await saves.refetch(); }} />
          : <Loading label="Loading saved ideas…" />}</View>
        : <DiscoveryResults>{results => <Results results={results} allowed={allowed} contextName={activeCollection?.collection.name ?? contextName}
          fromCollection={!!activeCollection}
          onExplore={() => setContext(EXPLORE)} search={search} mode={mode} area={areaSearch.applied}
          pendingArea={areaSearch.candidate} selectedId={selectedId} onSelect={setSelectedId} onOpen={onOpen}
          top={headerHeight} bottom={chipsHeight} onAreaAction={dispatchArea} onClearSearch={() => setTyped('')} />}</DiscoveryResults>}
    </View>
    <View style={[styles.header, mode === 'list' && styles.headerSolid, { paddingTop: top }]} pointerEvents="box-none"
      onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
      <View style={styles.buttons} pointerEvents="box-none">
        <RoundButton icon={mode === 'map' ? 'list' : 'map'} label={mode === 'map' ? 'Show list' : 'Show map'}
          onPress={() => setMode(mode === 'map' ? 'list' : 'map')} />
        <View style={styles.buttons}>
          <RoundButton icon="search" label="Search activities" selected={searchOpen} onPress={() => setSearchOpen(open => !open)} />
          <RoundButton icon="sliders" label={active ? `Filters, ${active} applied` : 'Filters'} onPress={() => setFiltersOpen(true)} />
        </View>
      </View>
      {searchOpen && <View style={styles.searchBox}>
        <TextField label="Search" value={typed} onChangeText={setTyped} placeholder="Name, area or activity"
          returnKeyType="search" autoCorrect={false} clearButtonMode="while-editing" autoFocus />
      </View>}
      {mode === 'list' && chips}
    </View>
    {mode === 'map' && <View style={styles.bottom} onLayout={event => setChipsHeight(event.nativeEvent.layout.height)}>{chips}</View>}
    <FilterSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} />
  </View>;
}

function Results({ results, allowed, contextName, fromCollection, onExplore, search, mode, area, pendingArea, selectedId, top, bottom, onSelect, onOpen, onAreaAction, onClearSearch }: {
  results: Experience[]; allowed: Set<string> | null; contextName: string; fromCollection: boolean; onExplore: () => void; search: string; mode: Mode; area?: Region; pendingArea?: Region; selectedId?: string;
  top: number; bottom: number; onSelect: (id?: string) => void; onOpen: (id: string) => void;
  onAreaAction: (action: AreaSearchAction) => void; onClearSearch: () => void;
}) {
  const inContext = useMemo(() => (allowed ? results.filter(result => allowed.has(result.id)) : results), [allowed, results]);
  const items = useMemo(() => filterToRegion(
    search ? inContext.filter(result => matchesSearch(result, search)) : inContext,
    area,
  ), [area, inContext, search]);
  if (allowed && inContext.length === 0) {
    return <View style={[styles.empty, { paddingTop: top + space.lg }]}>
      <Empty title={allowed.size === 0 && !fromCollection ? `Nothing saved in ${contextName} yet` : `Nothing in ${contextName} matches your filters`}
        description={allowed.size === 0 && !fromCollection ? 'Open an activity and tap Save to add it here.' : 'Clear a filter, or switch to Explore Austin.'} />
      <Button label="Explore Austin" variant="secondary" onPress={onExplore} />
    </View>;
  }
  if (items.length === 0) {
    return <View style={[styles.empty, { paddingTop: top + space.lg }]}>
      <Empty title={search ? `Nothing matches “${search}”` : 'Nothing matches this area'}
        description={search ? 'Try another word, or clear the search.' : 'Clear the area to see all of Austin again.'} />
      <Button label={search ? 'Clear search' : 'Clear area'} variant="secondary"
        onPress={search ? onClearSearch : () => onAreaAction({ type: 'clear' })} />
    </View>;
  }
  const selected = items.find(i => i.id === selectedId);
  return mode === 'map'
    ? <MapPane items={items} selected={selected} area={area} pendingArea={pendingArea} top={top} bottom={bottom}
      onAreaAction={onAreaAction} onSelect={onSelect} onOpen={onOpen} />
    : <ListPane items={items} selectedId={selected?.id} top={top} onOpen={onOpen} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  // The buttons float over the map, so the header and the chips are laid over the results, not above them.
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md },
  headerSolid: { backgroundColor: color.bg },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  searchBox: { padding: space.md, borderRadius: radius.lg, backgroundColor: color.bg, boxShadow: [...shadow.card] },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chipsBlock: { gap: space.xs },
  collectionLine: { ...type.caption, color: color.text, paddingHorizontal: space.lg },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  overlay: { position: 'absolute', left: space.lg, right: space.lg },
  searchArea: { alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: { ...type.title1, color: color.text },
  note: { ...type.callout, backgroundColor: color.bg, padding: space.sm, borderRadius: radius.sm },
  preview: { flexDirection: 'row', gap: space.md, padding: space.md, minHeight: minTap, backgroundColor: color.bg,
    borderRadius: radius.lg, boxShadow: [...shadow.card] },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.sm },
  summary: { flex: 1, gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
  listContent: { padding: space.lg, gap: space.sm },
  row: { borderRadius: radius.lg },
  rowSelected: { borderWidth: 2, borderColor: color.primary },
  empty: { padding: space.lg, gap: space.md },
});
