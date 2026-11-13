import { Pressable, StyleSheet, Text, View } from 'react-native';

import { elevation, palette, radii, textStyles } from '@/theme/tokens';

export type FilterSegmentedProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

/** A recessed track with one elevated, lit segment. */
export function FilterSegmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: FilterSegmentedProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 32,
    borderRadius: radii.md,
    backgroundColor: elevation.elevated.background,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm + 2,
  },
  segmentSelected: {
    backgroundColor: elevation.elevated.background,
    borderWidth: 1,
    borderColor: elevation.borderStrong,
  },
  label: {
    ...textStyles.labelMd,
    color: palette.inkFaint,
  },
  labelSelected: {
    color: palette.inkPrimary,
  },
});
