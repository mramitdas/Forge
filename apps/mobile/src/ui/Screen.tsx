import { type ReactNode } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, space, type } from "./tokens";

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
  const heading =
    title && Platform.OS !== "ios" ? (
      <Text style={styles.largeTitle}>{title}</Text>
    ) : null;

  const refresh =
    onRefresh != null ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.tint}
      />
    ) : undefined;

  if (!scroll) {
    return (
      <View style={styles.root}>
        {heading}
        <View style={styles.flex}>{children}</View>
        {footer}
      </View>
    );
  }

  return (
    <View style={styles.root}>
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
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  content: { paddingBottom: space.xxl, flexGrow: 1 },
  largeTitle: {
    ...type.largeTitle,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
});
