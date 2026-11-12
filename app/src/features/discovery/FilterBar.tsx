import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Chip, Label, Sheet } from '../../ui';
import { color, minTap, space, type } from '../../ui/theme';
import { fromChicagoLocal, PLAN_TIME_ZONE, toChicagoLocal } from '../../lib/time';
import { useFilters } from './FiltersContext';
import { chicagoToday, dateFilterLabel } from './dates';
import { ACTIVITY_CATEGORIES, PRICE_FILTERS, countActiveFilters, priceFilterLabel } from './filters';
import { useDiscovery } from './useDiscovery';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}>
    <Label accessibilityRole="header" style={[type.overline, styles.overline]}>{title.toUpperCase()}</Label>
    <View style={styles.chips}>{children}</View>
  </View>;
}

const noon = (day: string) => fromChicagoLocal(`${day}T12:00`) ?? new Date();

// The picked day. iOS shows a compact date field in the sheet; Android opens its date dialog, then offers "Change date".
function DayPicker({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const [open, setOpen] = useState(true);
  const today = chicagoToday();
  return <View style={styles.picker}>
    {/* The picker runs in Austin time whatever the phone's zone is (rule 4). */}
    {(open || Platform.OS === 'ios') && <DateTimePicker value={noon(day)} minimumDate={noon(today)} mode="date"
      display={Platform.OS === 'ios' ? 'compact' : 'default'} timeZoneName={PLAN_TIME_ZONE} accessibilityLabel="Date"
      onChange={(event, picked) => {
        if (Platform.OS === 'android') setOpen(false);
        if (picked && event.type !== 'dismissed') onChange(toChicagoLocal(picked).slice(0, 10));
      }} />}
    {Platform.OS === 'android' && !open && <Button label="Change date" size="small" variant="secondary" onPress={() => setOpen(true)} />}
  </View>;
}

function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { filters, setActivity, setPrice, setDate, setIncludeUnknownPrices, clear } = useFilters();
  const picked = typeof filters.date === 'object' ? filters.date.day : null;
  const { results } = useDiscovery();
  const count = results?.length;
  return <Sheet title="Filters" visible={visible} onClose={onClose}>
    <Section title="Activity">
      <Chip label="All" selected={filters.activity === 'all'} onPress={() => setActivity('all')} />
      {ACTIVITY_CATEGORIES.map(category => <Chip key={category} label={category}
        selected={filters.activity === category} onPress={() => setActivity(category)} />)}
    </Section>
    <Section title="Date">
      {(['any', 'this-weekend', 'next-weekend'] as const).map(option => <Chip key={option} label={dateFilterLabel(option)}
        selected={filters.date === option} onPress={() => setDate(option)} />)}
      <Chip label={picked ? dateFilterLabel(filters.date) : 'Pick a date'} selected={picked !== null}
        onPress={() => setDate({ day: picked ?? chicagoToday() })} />
    </Section>
    {picked && <DayPicker day={picked} onChange={day => setDate({ day })} />}
    <Section title="Price per person">
      {PRICE_FILTERS.map(option => <Chip key={option.id} label={option.label}
        selected={filters.price === option.id} onPress={() => setPrice(option.id)} />)}
    </Section>
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Label style={type.bodyStrong}>Include unknown prices</Label>
        <Label style={styles.hint}>{filters.includeUnknownPrices
          ? 'On: shown with a “Price unknown” label'
          : 'Off: hidden when a price limit is set'}</Label>
      </View>
      <Switch accessibilityLabel="Include unknown prices"
        value={filters.includeUnknownPrices} onValueChange={setIncludeUnknownPrices}
        trackColor={{ true: color.primary, false: color.lineStrong }} thumbColor={color.onPrimary} ios_backgroundColor={color.lineStrong} />
    </View>
    <Button label={count === undefined ? 'Show results' : `Show ${count} ${count === 1 ? 'result' : 'results'}`} onPress={onClose} />
    <Button label="Reset" accessibilityLabel="Reset filters" variant="text" onPress={clear} />
  </Sheet>;
}

// The row under the Map and List headers: a Filters button, plus a chip for each filter that is on.
// Tapping a chip turns that filter off, so the state is always visible in words and one tap from undone.
export function FilterBar() {
  const { filters, setActivity, setPrice, setDate, setIncludeUnknownPrices } = useFilters();
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters);
  return <View style={styles.bar}>
    <Button label="Filters" size="small" variant="secondary"
      accessibilityLabel={active ? `Filters, ${active} applied` : 'Filters'} onPress={() => setOpen(true)} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.active}>
      {filters.activity !== 'all' && <Chip label={filters.activity} selected onPress={() => setActivity('all')} />}
      {filters.price !== 'any' && <Chip label={priceFilterLabel(filters.price)} selected onPress={() => setPrice('any')} />}
      {!filters.includeUnknownPrices && <Chip label="Known prices only" selected onPress={() => setIncludeUnknownPrices(true)} />}
      {filters.date !== 'any' && <Chip label={dateFilterLabel(filters.date)} selected onPress={() => setDate('any')} />}
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTap },
  toggleText: { flex: 1, gap: space.xxs },
  hint: { ...type.caption, color: color.textSecondary },
  picker: { flexDirection: 'row', alignItems: 'center', minHeight: minTap },
});
