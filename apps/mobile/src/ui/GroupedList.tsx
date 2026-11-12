import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "./tokens";

type GroupedListProps = {
  header?: string;
  children: ReactNode;
  style?: object;
};

export function GroupedList({ header, children, style }: GroupedListProps) {
  return (
    <View style={[styles.wrap, style]}>
      {header ? <Text style={styles.header}>{header}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  header: {
    ...type.footnote,
    textTransform: "uppercase",
    marginLeft: space.lg,
    marginBottom: 6,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
});
