import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { elevation, radii } from '@/theme/tokens';

export type GlassCardProps = {
  children: React.ReactNode;
  variant?: 'glass' | 'elevated';
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

/**
 * A translucent panel. Glass blurs what sits behind it; elevated is the opaque
 * surface for sheets and dialogs, where text must not compete with a list.
 */
export function GlassCard({ children, variant = 'glass', style, padded = true }: GlassCardProps) {
  const isGlass = variant === 'glass';

  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        isGlass ? styles.glass : styles.elevated,
        style,
      ]}
    >
      {isGlass && Platform.OS !== 'web' ? (
        <BlurView
          intensity={elevation.glass.blur}
          tint="dark"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  glass: {
    backgroundColor: elevation.glass.background,
    borderColor: elevation.border,
  },
  elevated: {
    backgroundColor: elevation.elevated.background,
    borderColor: elevation.borderStrong,
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  padded: {
    padding: 16,
  },
  content: {
    flex: 1,
  },
});
