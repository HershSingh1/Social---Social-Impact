import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from './theme';

export function Placeholder({ title }: { title: string }) {
  return (
    <View style={styles.root}>
      <Text style={[type.title, { color: color.text }]} accessibilityRole="header">{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: color.bg },
});
