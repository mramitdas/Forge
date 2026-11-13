import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, textStyles } from '@/theme/tokens';

export type EmptyStateProps = {
  title: string;
  message?: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...textStyles.titleMd,
    color: palette.inkPrimary,
  },
  message: {
    ...textStyles.bodyMd,
    color: palette.inkFaint,
    textAlign: 'center',
  },
});
