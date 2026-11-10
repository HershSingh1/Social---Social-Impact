import { useEffect, useRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import type { Experience } from '@/types/database';
import { space } from '@/shared/ui';
import { ExperienceRow } from './ExperienceRow';

/** The same results as the map. Opens scrolled to the selected experience (spec P0-04). */
export function ExperienceList({ experiences, selectedId, onPressItem, header }: {
  experiences: Experience[]; selectedId: string | null; onPressItem: (id: string) => void; header?: React.ReactElement;
}) {
  const ref = useRef<FlatList<Experience>>(null);
  const didScroll = useRef(false);

  useEffect(() => {
    if (didScroll.current || !selectedId) return;
    const index = experiences.findIndex((e) => e.id === selectedId);
    if (index < 0) return;
    didScroll.current = true;
    try { ref.current?.scrollToIndex({ index, animated: false, viewPosition: 0.15 }); } catch { /* list not measured yet: onScrollToIndexFailed retries */ }
  }, [experiences, selectedId]);

  return (
    <FlatList
      ref={ref}
      data={experiences}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onScrollToIndexFailed={(info) => {
        ref.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        setTimeout(() => ref.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.15 }), 80);
      }}
      renderItem={({ item }) => <ExperienceRow item={item} selected={item.id === selectedId} onPress={() => onPressItem(item.id)} />}
    />
  );
}

const styles = StyleSheet.create({ content: { padding: space.lg, gap: space.md, paddingBottom: 120 } });
