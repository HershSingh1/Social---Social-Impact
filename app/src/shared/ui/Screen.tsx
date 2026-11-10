import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, useColors } from './theme';

export function Screen({ children, scroll = true, refreshing, onRefresh, edges = ['top'] }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: c.bg }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
});
