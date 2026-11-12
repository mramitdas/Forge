import { type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, rowMinHeight, space, type } from "./tokens";

type GroupedRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
};

export function GroupedRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron,
  destructive,
  last,
}: GroupedRowProps) {
  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.mid}>
        <Text
          style={[styles.title, destructive && styles.destructive]}
          numberOfLines={destructive ? undefined : 1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
      ) : null}
      {!last ? (
        <View
          style={[styles.separator, leading ? styles.separatorInset : null]}
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  row: {
    minHeight: rowMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    position: "relative",
  },
  rowLast: {},
  leading: { marginRight: space.md },
  mid: { flex: 1, minWidth: 0 },
  title: { ...type.title, fontWeight: "400" },
  destructive: {
    color: colors.red,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  subtitle: { ...type.subhead, marginTop: 1 },
  trailing: { marginLeft: space.sm, flexShrink: 0 },
  separator: {
    position: "absolute",
    left: space.lg,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  separatorInset: { left: 60 },
});
