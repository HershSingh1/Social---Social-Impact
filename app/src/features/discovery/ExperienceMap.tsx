import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { Experience } from '@/types/database';
import { Text, radius, useColors } from '@/shared/ui';
import { DEFAULT_REGION } from './locate';
import { priceShort } from './format';

export type MapFocus = { latitude: number; longitude: number; nonce: number };

/**
 * Pins show the price. Every pin is also in the list (the toggle below the map), so nothing on the map is
 * map-only. `focus` moves the camera (locate button, or arriving from the list with a selection).
 */
export function ExperienceMap({ experiences, selectedId, onSelect, focus, showsUserLocation }: {
  experiences: Experience[]; selectedId: string | null; onSelect: (id: string) => void;
  focus: MapFocus | null; showsUserLocation: boolean;
}) {
  const c = useColors();
  const ref = useRef<MapView>(null);

  useEffect(() => {
    if (focus) ref.current?.animateToRegion({ latitude: focus.latitude, longitude: focus.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
  }, [focus]);

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={DEFAULT_REGION}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      accessibilityLabel="Map of Austin. The same experiences are in the list view."
    >
      {experiences.map((e) => {
        const selected = e.id === selectedId;
        return (
          // key includes `selected` so the pin's snapshot is redrawn when selection changes
          <Marker
            key={`${e.id}-${selected}`}
            coordinate={{ latitude: e.lat, longitude: e.lng }}
            onPress={() => onSelect(e.id)}
            tracksViewChanges={false}
            title={e.name}
            description={priceShort(e)}
            zIndex={selected ? 2 : 1}
          >
            <View style={[styles.pin, { backgroundColor: selected ? c.primary : c.card, borderColor: selected ? c.primary : c.border }]}>
              <Text variant="caption" color={selected ? c.onPrimary : c.text} style={styles.pinText} allowFontScaling={false}>
                {priceShort(e) === 'Price unknown' ? '?' : priceShort(e)}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, minWidth: 34, alignItems: 'center' },
  pinText: { fontWeight: '700' },
});
