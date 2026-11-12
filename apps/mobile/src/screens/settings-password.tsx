import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { apiFetch } from "@/lib/api";
import type { TokenResponse } from "@/lib/types";
import { GroupedList, Screen } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

export function SettingsPasswordScreen() {
  const { completePasswordChange } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const canUpdate = current.length > 0 && next.length >= 8 && !saving;

  const changePassword = async () => {
    if (!canUpdate) return;
    setSaving(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      Alert.alert("Password changed", "Your password was updated.");
      router.back();
    } catch (error: any) {
      Alert.alert("Could not change password", error?.detail?.error ?? error?.message ?? "Request failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Password",
          headerRight: () => (
            <Text
              onPress={() => void changePassword()}
              style={[t.title, styles.update, { color: palette.accent, fontWeight: "600" as const }, !canUpdate && { color: palette.tertiary }]}
              accessibilityRole="button"
            >
              Update
            </Text>
          ),
        }}
      />
      <Screen title="Password">
        <GroupedList>
          <TextInput
            placeholder="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="Current password"
          />
          <TextInput
            placeholder="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            placeholderTextColor={palette.tertiary}
            style={[t.body, styles.input, { color: palette.label }]}
            accessibilityLabel="New password"
          />
        </GroupedList>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  update: {},
  input: {
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
});