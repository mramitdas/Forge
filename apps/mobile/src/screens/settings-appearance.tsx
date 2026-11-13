import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type Appearance } from '@/theme';
import { palette, radii, spacing, textStyles } from '@/theme/tokens';

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceScreen() {
  const { appearance, setAppearance } = useTheme();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Appearance</Text>
      <View style={styles.group}>
        {OPTIONS.map((option) => {
          const selected = appearance === option.value;
          return (
            <Pressable
              key={option.value}
              testID={`appearance-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={styles.row}
              onPress={() => setAppearance(option.value)}
            >
              <Text style={styles.rowLabel}>{option.label}</Text>
              {selected ? <Text style={styles.tick}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...textStyles.headlineMd, color: palette.inkPrimary },
  group: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.surfaceBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.surfaceBorder,
  },
  rowLabel: { ...textStyles.bodyLg, color: palette.inkPrimary },
  tick: { ...textStyles.bodyLg, color: palette.primaryContainer },
});
