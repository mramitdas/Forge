import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

type SummaryCardProps = {
  value: string;
  caption: string;
  onPress?: () => void;
  valueColor?: string;
};

export function SummaryCard({ value, caption, onPress, valueColor }: SummaryCardProps) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: palette.surface, borderRadius: radius.md }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${caption}: ${value}`}
    >
      <Text style={[t.largeTitle, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[t.footnote, styles.caption]}>{caption}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  caption: { marginTop: space.xs },
});