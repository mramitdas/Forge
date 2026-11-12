import { StyleSheet, Text } from "react-native";
import { colors, type } from "./tokens";

const TINT: Record<string, string> = {
  active: colors.green,
  paid: colors.green,
  allowed: colors.green,
  pending: colors.amber,
  overdue: colors.red,
  denied: colors.red,
};

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusCaption({ status }: { status: string }) {
  const key = status.toLowerCase();
  const color = TINT[key] ?? colors.secondary;
  return <Text style={[styles.text, { color }]}>{titleCase(status)}</Text>;
}

const styles = StyleSheet.create({
  text: { ...type.caption, fontWeight: "400" },
});
