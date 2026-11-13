import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { elevation, palette, radii, spacing, textStyles } from '@/theme/tokens';
import { PressableScale } from '@/ui/PressableScale';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const canSubmit = emailValid && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const result = await signIn(email.trim(), password, staySignedIn);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.replace(
      result.session.mustResetPassword ? '/(tabs)/settings/password' : '/(tabs)/home'
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>FitWoody</Text>
        <Text style={styles.tagline}>Run your gym from your pocket.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          testID="login-email"
          style={[styles.input, email.length > 0 && !emailValid && styles.inputInvalid]}
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            setError(null);
          }}
          placeholder="Email"
          placeholderTextColor={palette.inkFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextInput
          testID="login-password"
          style={styles.input}
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setError(null);
          }}
          placeholder="Password"
          placeholderTextColor={palette.inkFaint}
          secureTextEntry
          autoCapitalize="none"
        />

        <Pressable
          testID="login-stay-signed-in"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: staySignedIn }}
          style={styles.stayRow}
          onPress={() => setStaySignedIn((current) => !current)}
        >
          <View style={[styles.checkbox, staySignedIn && styles.checkboxChecked]}>
            {staySignedIn ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.stayLabel}>Stay signed in</Text>
        </Pressable>

        {error ? (
          <Text testID="login-error" style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <PressableScale
          testID="login-submit"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={submit}
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
        >
          <Text style={[styles.submitLabel, !canSubmit && styles.submitLabelDisabled]}>Sign in</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  brand: {
    gap: spacing.sm,
  },
  wordmark: {
    ...textStyles.headlineXl,
    color: palette.inkPrimary,
  },
  tagline: {
    ...textStyles.bodyMd,
    color: palette.inkFaint,
  },
  form: {
    gap: spacing.md,
  },
  input: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: elevation.glass.background,
    borderWidth: 1,
    borderColor: elevation.inputBorder,
    color: palette.inkPrimary,
    ...textStyles.bodyLg,
  },
  inputInvalid: {
    borderColor: palette.signalRed,
  },
  stayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: palette.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: palette.primaryContainer,
    borderColor: palette.primaryContainer,
  },
  checkmark: {
    fontSize: 12,
    color: palette.accentInk,
  },
  stayLabel: {
    ...textStyles.bodyMd,
    color: palette.inkSecondary,
  },
  error: {
    ...textStyles.bodyMd,
    color: palette.signalRed,
  },
  submit: {
    height: 44,
    borderRadius: radii.md,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primaryContainer,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  submitDisabled: {
    backgroundColor: palette.surfaceContainerHigh,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitLabel: {
    ...textStyles.labelLg,
    color: palette.accentInk,
  },
  submitLabelDisabled: {
    color: palette.inkFaint,
  },
});
