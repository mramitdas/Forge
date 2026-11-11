import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space, type } from "./tokens";

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
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={16} color={colors.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.tertiary}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
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
    backgroundColor: colors.searchFill,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  input: {
    flex: 1,
    ...type.body,
    padding: 0,
  },
});
