import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { radius, space, useColors } from './theme';
import { Text } from './Text';
import { Button } from './Button';

export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: DimensionValue }) {
  const c = useColors();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={{ height, width, borderRadius: radius.sm, backgroundColor: c.skeleton, opacity: pulse }} />;
}

export function SkeletonList({ rows = 3, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ gap: space.md }}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={rowHeight} />)}
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string; body?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.centerText}>{title}</Text>
      {body ? <Text muted style={styles.centerText}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<unknown> }) {
  const c = useColors();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="heading" color={c.danger} style={styles.centerText}>{message}</Text>
      <Text muted style={styles.centerText}>Check your connection, then try again. Nothing you entered was lost.</Text>
      <Button label="Try again" onPress={onRetry} variant="secondary" />
    </View>
  );
}

/** Inline notice used when a refresh failed but older data is still on screen ("Try again keeps what was on screen"). */
export function StaleBanner({ onRetry }: { onRetry: () => void | Promise<unknown> }) {
  const c = useColors();
  return (
    <View style={[styles.banner, { backgroundColor: c.warnSoft }]} accessibilityRole="alert">
      <Text variant="small" color={c.warn} style={{ flex: 1 }}>Couldn't refresh. Showing what we had.</Text>
      <Button label="Try again" onPress={onRetry} variant="ghost" />
    </View>
  );
}

/**
 * Loading (skeleton) / Error (retry, keeps old data) / Empty / Ready for any react-query result.
 */
export function AsyncView<T>({ query, isEmpty, empty, skeleton, errorMessage, children }: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  errorMessage: string;
  children: (data: T) => ReactNode;
}) {
  const { data, isPending, isError, refetch } = query;
  if (data === undefined) {
    if (isPending) return <>{skeleton ?? <SkeletonList />}</>;
    if (isError) return <ErrorState message={errorMessage} onRetry={() => refetch()} />;
  }
  if (data === undefined) return null;
  if (isEmpty?.(data)) return <>{empty}</>;
  return (
    <View style={{ gap: space.lg }}>
      {isError ? <StaleBanner onRetry={() => refetch()} /> : null}
      {children(data)}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  centerText: { textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
});
