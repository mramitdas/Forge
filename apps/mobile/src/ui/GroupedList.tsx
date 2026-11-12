import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";
import { radius, space, type } from "@/ui/theme";

type GroupedListProps = {
  header?: string;
  children: ReactNode;
  style?: object;
};

export function GroupedList({ header, children, style }: GroupedListProps) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  return (
    <View style={[styles.wrap, style]}>
      {header ? <Text style={[t.footnote, styles.header]}>{header}</Text> : null}
      <View style={[styles.group, { backgroundColor: palette.surface, borderRadius: radius.md, overflow: "hidden" as const }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  header: {
    textTransform: "uppercase",
    marginLeft: space.lg,
    marginBottom: 6,
  },
  group: {},
});