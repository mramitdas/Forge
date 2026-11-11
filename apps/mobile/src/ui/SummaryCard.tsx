import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors, radius, space, type } from "./tokens";

type SummaryCardProps = {
  value: string;
  caption: string;
  onPress?: () => void;
  valueColor?: string;
};

export function SummaryCard({ value, caption, onPress, valueColor }: SummaryCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${caption}: ${value}`}
    >
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.caption}>{caption}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  value: { ...type.largeTitle },
  caption: { ...type.footnote, marginTop: space.xs },
});
