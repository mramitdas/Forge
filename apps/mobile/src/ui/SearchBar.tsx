import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

type SearchBarProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: SearchBarProps) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return (
    <View style={[styles.wrap, { backgroundColor: palette.searchFill, borderRadius: radius.md }]}>
      <Ionicons name="search" size={16} color={palette.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.tertiary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[t.body, styles.input, { color: palette.label }]}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 36,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  input: { flex: 1, padding: 0 },
});