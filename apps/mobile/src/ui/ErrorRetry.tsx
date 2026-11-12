import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, space, type } from "./tokens";

export function ErrorRetry({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.msg}>Could not load.</Text>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.retry}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.xxl, alignItems: "center" },
  msg: { ...type.footnote, marginBottom: space.sm },
  retry: { ...type.footnote, color: colors.tint, fontWeight: "600" },
});
