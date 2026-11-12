import { Text } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";
import { space } from "@/ui/theme";

export function Empty({ label }: { label: string }) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return <Text style={[t.footnote, styles.text]}>{label}</Text>;
}

const styles = {
  text: { textAlign: "center" as const, padding: space.xxl },
};