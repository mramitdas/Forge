import { type ReactNode } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

type ScreenProps = {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: ReactNode;
};

export function Screen({
  title,
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  footer,
}: ScreenProps) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  const heading =
    title && Platform.OS !== "ios" ? (
      <Text style={[t.largeTitle, styles.largeTitle]}>{title}</Text>
    ) : null;

  const refresh =
    onRefresh != null ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={palette.accent}
      />
    ) : undefined;

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: palette.canvas }]}>
        {heading}
        <View style={styles.flex}>{children}</View>
        {footer}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={refresh}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {heading}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingBottom: space.xxl, flexGrow: 1 },
  largeTitle: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
});