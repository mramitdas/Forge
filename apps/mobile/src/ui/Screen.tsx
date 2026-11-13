import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, spacing } from '@/theme/tokens';

export type ScreenProps = {
  children: React.ReactNode;
  header?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The page scaffold every screen sits on: the canvas, the safe area, a 16px
 * outer margin and optional pull-to-refresh.
 */
export function Screen({
  children,
  header,
  onRefresh,
  refreshing = false,
  scroll = true,
  contentStyle,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top, paddingBottom: insets.bottom };

  const body = (
    <View style={[styles.body, contentStyle]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.screen, padding]}>
        {body}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={[styles.screen, padding]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.inkFaint}
          />
        ) : undefined
      }
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  content: {
    flexGrow: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
  },
});
