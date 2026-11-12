import { type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space, rowMinHeight } from "@/ui/theme";

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
  const { palette } = useTheme();
  const t = textStyles(palette);
  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.mid}>
        <Text
          style={[t.title, destructive && { color: palette.danger, fontWeight: "600" as const }]}
          numberOfLines={destructive ? undefined : 1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[t.subhead, styles.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={palette.tertiary} />
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
    position: "relative",
  },
  rowLast: {},
  leading: { marginRight: space.md },
  mid: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 1 },
  trailing: { marginLeft: space.sm, flexShrink: 0 },
  separator: {
    position: "absolute",
    left: space.lg,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  separatorInset: { left: 60 },
});