import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { radius, space } from "@/ui/theme";

export function SummaryCardSkeleton() {
  const { palette } = useTheme();
  return <View style={[styles.card, { backgroundColor: palette.surfaceStrong }]} />;
}

export function RowSkeleton() {
  const { palette } = useTheme();
  return <View style={[styles.row, { backgroundColor: palette.surfaceStrong }]} />;
}

const styles = StyleSheet.create({
  card: {
    height: 88,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    borderRadius: radius.md,
    opacity: 0.4,
  },
  row: {
    height: 44,
    opacity: 0.4,
  },
});