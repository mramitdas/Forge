import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing, textStyles } from '@/theme/tokens';

export type ErrorRetryProps = {
  message?: string;
  onRetry: () => void;
};

export function ErrorRetry({ message = 'Something went wrong.', onRetry }: ErrorRetryProps) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  message: {
    ...textStyles.bodyMd,
    color: palette.inkSecondary,
    textAlign: 'center',
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.surfaceBorderStrong,
  },
  buttonLabel: {
    ...textStyles.labelLg,
    color: palette.inkPrimary,
  },
});
