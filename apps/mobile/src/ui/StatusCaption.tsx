import { Text } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";

const TINT: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  active: "success",
  paid: "success",
  allowed: "success",
  pending: "warning",
  overdue: "danger",
  denied: "danger",
};

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusCaption({ status }: { status: string }) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  const key = status.toLowerCase();
  const color = TINT[key] ? palette[TINT[key]] : palette.secondary;
  return <Text style={[t.caption, { color }]}>{titleCase(status)}</Text>;
}