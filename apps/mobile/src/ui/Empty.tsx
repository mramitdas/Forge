import { StyleSheet, Text } from "react-native";
import { space, type } from "./tokens";

export function Empty({ label }: { label: string }) {
  return <Text style={styles.text}>{label}</Text>;
}

const styles = StyleSheet.create({
  text: {
    ...type.footnote,
    textAlign: "center",
    padding: space.xxl,
  },
});
