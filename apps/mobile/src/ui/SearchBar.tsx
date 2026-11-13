import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { elevation, palette, radii, spacing, textStyles } from '@/theme/tokens';

export type SearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search', testID }: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, focused && styles.focused]}>
      <Text style={styles.icon}>⌕</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.inkFaint}
        style={styles.input}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: elevation.glass.background,
    borderWidth: 1,
    borderColor: elevation.inputBorder,
  },
  focused: {
    borderColor: elevation.inputFocus,
  },
  icon: {
    color: palette.inkFaint,
    fontSize: 15,
  },
  input: {
    flex: 1,
    color: palette.inkPrimary,
    ...textStyles.bodyMd,
  },
});
