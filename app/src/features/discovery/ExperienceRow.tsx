import { Pressable, StyleSheet, View } from 'react-native';
import type { Experience } from '@/types/database';
import { Tag, Text, radius, space, useColors } from '@/shared/ui';
import { categoryLabel } from './categories';
import { CategoryArt } from './CategoryArt';
import { durationLabel, priceKindWord, priceShort } from './format';

/** A list row. The same facts as the map's preview card; selected is shown in words as well as styling. */
export function ExperienceRow({ item, selected, onPress }: { item: Experience; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const price = priceShort(item);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        item.name, categoryLabel(item.category), item.area, price === 'Price unknown' ? 'Price unknown' : `${price}, ${priceKindWord(item).toLowerCase()}`,
        durationLabel(item.duration_min), item.booking_required ? 'Booking required' : null, selected ? 'Selected' : null,
      ].filter(Boolean).join(', ')}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.card, borderColor: selected ? c.primary : c.border, borderWidth: selected ? 2 : 1, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <CategoryArt category={item.category} height={72} />
      <View style={styles.body}>
        <Text variant="caption" muted>{categoryLabel(item.category)}, {item.area}</Text>
        <Text variant="bodyStrong">{item.name}</Text>
        <Text variant="small">{price}{item.price_kind === 'estimated' ? ' (estimated)' : ''}  ·  {durationLabel(item.duration_min)}</Text>
        <View style={styles.tags}>
          {item.booking_required ? <Tag label="Booking required" tone="warn" /> : null}
          {selected ? <Tag label="Selected" tone="info" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, minHeight: 96 },
  body: { flex: 1, gap: 2 },
  tags: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', marginTop: 2 },
});
