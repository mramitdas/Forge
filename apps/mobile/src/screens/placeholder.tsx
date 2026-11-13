import { StyleSheet, Text, View } from 'react-native';

export function PlaceholderScreen({ name }: { name: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.note}>Placeholder — implemented in its own issue.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '600' },
  note: { marginTop: 8, fontSize: 13, opacity: 0.7 },
});
