import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

type SegmentedProps = {
  values: string[];
  value: string;
  onChange: (v: string) => void;
};

export function Segmented({ values, value, onChange }: SegmentedProps) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return (
    <View style={[styles.track, { backgroundColor: palette.surfaceStrong, borderRadius: radius.sm }]}>
      {values.map((v) => {
        const selected = v === value;
        return (
          <TouchableOpacity
            key={v}
            style={[styles.segment, selected && { backgroundColor: palette.surface }]}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[t.caption, styles.label, selected && { fontWeight: "600" as const }]}
              numberOfLines={1}
            >
              {v}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 32,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    flexDirection: "row",
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  label: {},
});