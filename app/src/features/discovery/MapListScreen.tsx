import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Empty, Label, Tag, TextField } from '../../ui';
import { color, minTap, radius, shadow, size, space, type } from '../../ui/theme';
import { DiscoveryResults } from './DiscoveryResults';
import { FilterBar } from './FilterBar';
import { AUSTIN, matchesSearch, priceLabel, SEARCH_DELAY_MS, timingLabel } from './search';
import type { Experience } from './useExperiences';

type Props = { onOpen: (experienceId: string) => void };
type Mode = 'map' | 'list';

function Summary({ item }: { item: Experience }) {
  return <View style={styles.summary}>
    <Label style={type.headline}>{item.name}</Label>
    <Label style={styles.caption}>{[item.category, item.area].filter(Boolean).join(' · ')}</Label>
    <Label style={styles.caption}>{priceLabel(item)} · {timingLabel(item)}</Label>
    {item.booking_required && <Tag label="Booking required" variant="outline" />}
  </View>;
}

/** The card under the map for the selected pin; tapping it opens Detail. */
function PreviewCard({ item, onOpen }: { item: Experience; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, open details`} onPress={onOpen} style={styles.preview}>
    {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.thumb} accessible={false} /> : null}
    <Summary item={item} />
  </Pressable>;
}

function MapPane({ items, selected, onSelect, onOpen }: { items: Experience[]; selected?: Experience; onSelect: (id?: string) => void; onOpen: (id: string) => void }) {
  const map = useRef<MapView>(null);
  const [locationNote, setLocationNote] = useState<string>();

  // Location is asked for only when Locate is tapped (rule 6). Denied keeps the map on downtown Austin.
  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocationNote('Location is off, so the map stays on downtown Austin. You can turn it on in Settings.'); return; }
    setLocationNote(undefined);
    const here = await Location.getCurrentPositionAsync({});
    map.current?.animateToRegion({ ...AUSTIN, latitude: here.coords.latitude, longitude: here.coords.longitude });
  }

  return <View style={styles.flex}>
    <MapView ref={map} style={styles.flex} initialRegion={AUSTIN} onPress={() => onSelect(undefined)} accessibilityLabel="Map of activities">
      {items.filter(i => i.lat !== null && i.lng !== null).map(i => <Marker key={i.id} identifier={i.id} title={i.name}
        coordinate={{ latitude: i.lat!, longitude: i.lng! }} pinColor={i.id === selected?.id ? color.primary : color.orange}
        onPress={event => { event.stopPropagation(); onSelect(i.id); }} />)}
    </MapView>
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.locate}><Button label="Locate me" variant="secondary" size="small" onPress={locate} /></View>
      {locationNote && <Label accessibilityRole="alert" style={styles.note}>{locationNote}</Label>}
      {selected && <PreviewCard item={selected} onOpen={() => onOpen(selected.id)} />}
    </View>
  </View>;
}

function ListPane({ items, selectedId, onOpen }: { items: Experience[]; selectedId?: string; onOpen: (id: string) => void }) {
  const list = useRef<FlatList<Experience>>(null);
  const index = items.findIndex(i => i.id === selectedId);
  // Opening the List scrolls to whatever was selected on the Map.
  useEffect(() => {
    if (index > 0) requestAnimationFrame(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <FlatList ref={list} data={items} keyExtractor={i => i.id} contentContainerStyle={styles.listContent}
    onScrollToIndexFailed={({ averageItemLength }) => list.current?.scrollToOffset({ offset: averageItemLength * index, animated: false })}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onOpen(item.id)}
      accessibilityLabel={`${item.name}${item.id === selectedId ? ', selected' : ''}`}
      style={[styles.row, item.id === selectedId && styles.rowSelected]}>
      <Card><Summary item={item} /></Card>
    </Pressable>} />;
}

// Map tab (P0-04): Map and List over the same filtered results. Search, filters and the selected pin are kept
// when switching between them. Figma 4.3 Map View (28:4763) and 4.1 Discover Feed (28:4626).
export function MapListScreen({ onOpen }: Props) {
  const [mode, setMode] = useState<Mode>('map');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  return <SafeAreaView edges={['top']} style={styles.screen}>
    <View style={styles.header}>
      <TextField label="Search" value={typed} onChangeText={setTyped} placeholder="Name, area or activity"
        returnKeyType="search" autoCorrect={false} clearButtonMode="while-editing" />
      <FilterBar />
      <View style={styles.toggle} accessibilityRole="radiogroup">
        <Chip label="Map" selected={mode === 'map'} onPress={() => setMode('map')} />
        <Chip label="List" selected={mode === 'list'} onPress={() => setMode('list')} />
      </View>
    </View>
    <View style={styles.flex}>
      <DiscoveryResults>{results => <Results results={results} search={search} mode={mode}
        selectedId={selectedId} onSelect={setSelectedId} onOpen={onOpen} onClearSearch={() => setTyped('')} />}</DiscoveryResults>
    </View>
  </SafeAreaView>;
}

function Results({ results, search, mode, selectedId, onSelect, onOpen, onClearSearch }: {
  results: Experience[]; search: string; mode: Mode; selectedId?: string;
  onSelect: (id?: string) => void; onOpen: (id: string) => void; onClearSearch: () => void;
}) {
  const items = useMemo(() => (search ? results.filter(r => matchesSearch(r, search)) : results), [results, search]);
  if (items.length === 0) {
    return <View style={styles.empty}>
      <Empty title={`Nothing matches “${search}”`} description="Try another word, or clear the search." />
      <Button label="Clear search" variant="secondary" onPress={onClearSearch} />
    </View>;
  }
  const selected = items.find(i => i.id === selectedId);
  return mode === 'map'
    ? <MapPane items={items} selected={selected} onSelect={onSelect} onOpen={onOpen} />
    : <ListPane items={items} selectedId={selected?.id} onOpen={onOpen} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  toggle: { flexDirection: 'row', gap: space.sm },
  overlay: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, top: space.lg, justifyContent: 'space-between' },
  locate: { alignSelf: 'flex-end' },
  note: { ...type.callout, backgroundColor: color.bg, padding: space.sm, borderRadius: radius.sm },
  preview: { flexDirection: 'row', gap: space.md, padding: space.md, minHeight: minTap, backgroundColor: color.bg,
    borderRadius: radius.lg, boxShadow: [...shadow.card], marginTop: 'auto' },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.sm },
  summary: { flex: 1, gap: space.xxs },
  caption: { ...type.caption, color: color.textSecondary },
  listContent: { padding: space.lg, gap: space.sm },
  row: { borderRadius: radius.lg },
  rowSelected: { borderWidth: 2, borderColor: color.primary },
  empty: { padding: space.lg, gap: space.md },
});
