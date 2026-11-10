import { Pressable, StyleSheet, View } from 'react-native';
import type { Experience } from '@/types/database';
import { Tag, Text, radius, space, useColors } from '@/shared/ui';
import { categoryLabel } from './categories';
import { CategoryArt } from './CategoryArt';
import { priceKindWord, priceShort, timingSummary } from './format';

/** Map: tapping a pin shows this card; tapping the card opens Detail (spec P0-04). */
export function PreviewCard({ item, onOpen }: { item: Experience; onOpen: () => void }) {
  const c = useColors();
  const price = priceShort(item);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${categoryLabel(item.category)}, ${item.area}, ${price === 'Price unknown' ? price : `${price}, ${priceKindWord(item).toLowerCase()}`}, ${timingSummary(item)}${item.booking_required ? ', booking required' : ''}. Opens details.`}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <CategoryArt category={item.category} height={72} />
      <View style={styles.body}>
        <Text variant="caption" muted>{categoryLabel(item.category)}, {item.area}</Text>
        <Text variant="bodyStrong">{item.name}</Text>
        <Text variant="small">{price}  ·  {timingSummary(item)}</Text>
        {item.booking_required ? <Tag label="Booking required" tone="warn" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, minHeight: 96 },
  body: { flex: 1, gap: 2 },
});
