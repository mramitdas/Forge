import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { apiFetch } from "@/lib/api";
import type { TokenResponse } from "@/lib/types";
import { GroupedList, Screen } from "@/ui";
import { colors, space, type as typeStyle } from "@/ui/tokens";

export function SettingsPasswordScreen() {
  const { completePasswordChange } = useAuth();
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
              style={[styles.update, !canUpdate && styles.updateDisabled]}
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
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            accessibilityLabel="Current password"
          />
          <TextInput
            placeholder="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            accessibilityLabel="New password"
          />
        </GroupedList>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  update: { ...typeStyle.title, color: colors.tint, fontWeight: "600" },
  updateDisabled: { color: colors.tertiary },
  input: {
    ...typeStyle.body,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
});
