import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, space, type } from "./tokens";

type SegmentedProps = {
  values: string[];
  value: string;
  onChange: (v: string) => void;
};

export function Segmented({ values, value, onChange }: SegmentedProps) {
  return (
    <View style={styles.track}>
      {values.map((v) => {
        const selected = v === value;
        return (
          <TouchableOpacity
            key={v}
            style={[styles.segment, selected && styles.selected]}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
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
    backgroundColor: colors.gray5,
    borderRadius: radius.sm,
    flexDirection: "row",
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  selected: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: { ...type.caption, fontWeight: "500", color: colors.label },
  labelSelected: { fontWeight: "600" },
});
