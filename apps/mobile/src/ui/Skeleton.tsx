import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "./tokens";

export function SummaryCardSkeleton() {
  return <View style={styles.card} />;
}

export function RowSkeleton() {
  return <View style={styles.row} />;
}

const styles = StyleSheet.create({
  card: {
    height: 88,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    backgroundColor: colors.gray5,
    borderRadius: radius.md,
    opacity: 0.4,
  },
  row: {
    height: 44,
    backgroundColor: colors.gray5,
    opacity: 0.4,
  },
});
