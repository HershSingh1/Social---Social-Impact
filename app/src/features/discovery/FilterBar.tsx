import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Label, Sheet } from '../../ui';
import { color, space, type } from '../../ui/theme';
import { useFilters } from './FiltersContext';
import { ACTIVITY_CATEGORIES, PRICE_FILTERS, countActiveFilters, priceFilterLabel } from './filters';
import { useDiscovery } from './useDiscovery';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}>
    <Label accessibilityRole="header" style={[type.overline, styles.overline]}>{title.toUpperCase()}</Label>
    <View style={styles.chips}>{children}</View>
  </View>;
}

function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { filters, setActivity, setPrice, clear } = useFilters();
  const { results } = useDiscovery();
  const count = results?.length;
  return <Sheet title="Filters" visible={visible} onClose={onClose}>
    <Section title="Activity">
      <Chip label="All" selected={filters.activity === 'all'} onPress={() => setActivity('all')} />
      {ACTIVITY_CATEGORIES.map(category => <Chip key={category} label={category}
        selected={filters.activity === category} onPress={() => setActivity(category)} />)}
    </Section>
    <Section title="Price per person">
      {PRICE_FILTERS.map(option => <Chip key={option.id} label={option.label}
        selected={filters.price === option.id} onPress={() => setPrice(option.id)} />)}
    </Section>
    <Button label={count === undefined ? 'Show results' : `Show ${count} ${count === 1 ? 'result' : 'results'}`} onPress={onClose} />
    <Button label="Reset" accessibilityLabel="Reset filters" variant="text" onPress={clear} />
  </Sheet>;
}

// The row under the Map and List headers: a Filters button, plus a chip for each filter that is on.
// Tapping a chip turns that filter off, so the state is always visible in words and one tap from undone.
export function FilterBar() {
  const { filters, setActivity, setPrice } = useFilters();
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters);
  return <View style={styles.bar}>
    <Button label="Filters" size="small" variant="secondary"
      accessibilityLabel={active ? `Filters, ${active} applied` : 'Filters'} onPress={() => setOpen(true)} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.active}>
      {filters.activity !== 'all' && <Chip label={filters.activity} selected onPress={() => setActivity('all')} />}
      {filters.price !== 'any' && <Chip label={priceFilterLabel(filters.price)} selected onPress={() => setPrice('any')} />}
    </ScrollView>
    <FilterSheet visible={open} onClose={() => setOpen(false)} />
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  active: { gap: space.sm, alignItems: 'center' },
  section: { gap: space.sm },
  overline: { color: color.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm },
});
