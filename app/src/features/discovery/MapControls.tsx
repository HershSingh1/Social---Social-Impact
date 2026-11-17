import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Label } from '../../ui';
import { color, minTap, radius, shadow, size, space, type } from '../../ui/theme';
import { useFilters } from './FiltersContext';
import { ACTIVITY_CATEGORIES, type ActivityCategory } from './filters';
import { priceLabel } from './search';
import type { Experience } from './useExperiences';

// Map controls from Figma 4.3 Map View (node 28:4763, file MkYNxuYFuktTR0yGExJnK7).
type IconName = ComponentProps<typeof Feather>['name'];

/** A 40 pt white circle with an icon. The pressable around it is 44 x 44 pt. */
export function RoundButton({ icon, label, selected, onPress }: {
  icon: IconName; label: string; selected?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}
    onPress={onPress} style={styles.hitArea}>
    <View style={[styles.round, selected && styles.roundSelected]}>
      <Feather name={icon} size={size.mapIcon} color={selected ? color.onPrimary : color.text} />
    </View>
  </Pressable>;
}

const CATEGORY_ICON: Record<ActivityCategory, IconName> = {
  'Art and walks': 'image', 'Make something': 'tool', Outdoors: 'sun', 'Food and drink': 'coffee',
  'Games and trivia': 'target', 'Music and film': 'music', Active: 'activity',
};

/** The row of category circles under the chips. Tapping one sets the Activity filter; tapping it again clears it. */
export function CategoryRow() {
  const { filters, setActivity } = useFilters();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categories}
    accessibilityRole="radiogroup" accessibilityLabel="Activity">
    {ACTIVITY_CATEGORIES.map(category => {
      const selected = filters.activity === category;
      return <Pressable key={category} accessibilityRole="checkbox" accessibilityLabel={category}
        accessibilityState={{ checked: selected }} onPress={() => setActivity(selected ? 'all' : category)} style={styles.category}>
        <View style={[styles.circle, selected && styles.circleSelected]}>
          <Feather name={CATEGORY_ICON[category]} size={size.mapIcon} color={selected ? color.onPrimary : color.orangeInk} />
        </View>
        <Label style={styles.categoryLabel} numberOfLines={2}>{category}</Label>
      </Pressable>;
    })}
  </ScrollView>;
}

// Every pin has the same width, so the photo's centre can sit on the coordinate.
const LABEL_WIDTH = 112;
const PIN_PADDING = space.xs;
const PIN_WIDTH = PIN_PADDING * 2 + size.mapPinSelected + space.sm + LABEL_WIDTH;

function PinLabel({ item }: { item: Experience }) {
  const when = item.timing_kind === 'flexible' ? item.hours_text : null;
  return <View style={styles.pinText}>
    <Label style={styles.pinName} numberOfLines={1}>{item.name}</Label>
    <Label style={styles.pinCaption} numberOfLines={1}>{[priceLabel(item), when].filter(Boolean).join(' · ')}</Label>
  </View>;
}

/** A round photo with the name and "price · when" beside it. The selected one has a larger photo with a dark ring (Figma puts it on a white card, but a background on a pin paints over its photo and text in the map's snapshot). */
export function PlaceMarker({ item, selected, onPress }: { item: Experience; selected: boolean; onPress: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [settledLook, setSettledLook] = useState<string>();
  const look = `${selected}-${loaded}`;
  // The map draws a custom pin once, so keep it redrawing until the photo is in and the selected look has settled.
  useEffect(() => {
    const timer = setTimeout(() => setSettledLook(look), 600);
    return () => clearTimeout(timer);
  }, [look]);
  const photo = selected ? size.mapPinSelected : size.mapPin;
  const centerX = PIN_PADDING + photo / 2;
  return <Marker identifier={item.id} accessibilityLabel={item.name} coordinate={{ latitude: item.lat!, longitude: item.lng! }}
    anchor={{ x: centerX / PIN_WIDTH, y: 0.5 }} centerOffset={{ x: PIN_WIDTH / 2 - centerX, y: 0 }}
    tracksViewChanges={settledLook !== look || selected} onPress={event => { event.stopPropagation(); onPress(); }}>
    <View style={styles.pin}>
      {item.image_url
        ? <Image source={{ uri: item.image_url }} onLoadEnd={() => setLoaded(true)} accessible={false}
          style={[styles.photo, selected && styles.photoSelected, { width: photo, height: photo, borderRadius: photo / 2 }]} />
        : <View style={[styles.photo, selected && styles.photoSelected, styles.noPhoto, { width: photo, height: photo, borderRadius: photo / 2 }]} />}
      <PinLabel item={item} />
    </View>
  </Marker>;
}

const styles = StyleSheet.create({
  hitArea: { width: minTap, height: minTap, alignItems: 'center', justifyContent: 'center' },
  round: { width: size.mapButton, height: size.mapButton, borderRadius: radius.pill, backgroundColor: color.bg,
    alignItems: 'center', justifyContent: 'center', boxShadow: [...shadow.card] },
  roundSelected: { backgroundColor: color.primary },
  categoryScroll: { backgroundColor: color.bg, flexGrow: 0 },
  categories: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  category: { width: 64, minHeight: minTap, alignItems: 'center', gap: space.xs },
  circle: { width: size.categoryCircle, height: size.categoryCircle, borderRadius: radius.pill, backgroundColor: color.orangeSoft,
    borderWidth: 1.5, borderColor: color.orange, alignItems: 'center', justifyContent: 'center' },
  circleSelected: { backgroundColor: color.primary, borderColor: color.primary },
  categoryLabel: { ...type.caption, color: color.text, textAlign: 'center' },
  pin: { width: PIN_WIDTH, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: PIN_PADDING },
  // A border, not the card shadow: the map snapshots a pin once, and a boxShadow layer comes out blank in the snapshot.
  photo: { borderWidth: 2, borderColor: color.bg },
  photoSelected: { borderWidth: 3, borderColor: color.primary },
  noPhoto: { backgroundColor: color.orange },
  pinText: { width: LABEL_WIDTH },
  pinName: { ...type.captionStrong, color: color.text },
  pinCaption: { ...type.caption, color: color.textSecondary },
});
