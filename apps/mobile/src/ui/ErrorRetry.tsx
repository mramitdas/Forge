import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";
import { space } from "@/ui/theme";

export function ErrorRetry({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return (
    <View style={styles.wrap}>
      <Text style={[t.footnote, styles.msg]}>Could not load.</Text>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={[t.footnote, { color: palette.accent, fontWeight: "600" } as const]}>
          Try Again
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.xxl, alignItems: "center" },
  msg: { marginBottom: space.sm },
});