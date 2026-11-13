import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, textStyles } from '@/theme/tokens';

/**
 * What any screen turns into for someone who lacks the capability. Calm, never
 * a dead end, and it never leaks part of the blocked screen.
 */
export function RestrictedArea({ message }: { message?: string }) {
  const router = useRouter();

  return (
    <View style={styles.wrap} accessibilityRole="alert" testID="restricted-area">
      <Text style={styles.title}>Restricted area</Text>
      <Text style={styles.message}>
        {message ?? 'Your role does not have access to this part of the app.'}
      </Text>
      <Text style={styles.hint}>Use the navigation below to get back to what you can see.</Text>
      <Text
        style={styles.back}
        accessibilityRole="button"
        onPress={() => router.canGoBack() && router.back()}
      >
        Go back
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    ...textStyles.headlineSm,
    color: palette.inkPrimary,
  },
  message: {
    ...textStyles.bodyMd,
    color: palette.inkSecondary,
    textAlign: 'center',
  },
  hint: {
    ...textStyles.bodySm,
    color: palette.inkFaint,
    textAlign: 'center',
  },
  back: {
    ...textStyles.labelLg,
    color: palette.primaryContainer,
    marginTop: spacing.md,
  },
});
