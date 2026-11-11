"use client";

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useAuth } from "@/auth/auth-context";
import { apiFetch } from "@/lib/api";
import type { TokenResponse } from "@/lib/types";

export function SettingsScreen() {
  const { me, logout, completePasswordChange } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (!current || next.length < 8) {
      Alert.alert("Invalid input", "Enter your current password and a new password of at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      setCurrent("");
      setNext("");
      Alert.alert("Password changed", "Your password was updated.");
    } catch (error: any) {
      Alert.alert("Could not change password", error?.detail?.error ?? error?.message ?? "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Log out", "Sign out of Forge on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Row label="Name" value={me?.user?.full_name ?? "—"} />
        <Row label="Email" value={me?.user?.email ?? "—"} />
        <Row label="Gym" value={me?.tenant_name ?? "—"} />
        <Row label="Role" value={me?.role_name ?? "—"} />
        <Row label="Branch" value={me?.branches?.[0]?.name ?? "—"} />
      </View>

      <Text style={styles.sectionTitle}>Change password</Text>
      <TextInput
        placeholder="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        placeholderTextColor="#9ca3af"
        style={styles.input}
        accessibilityLabel="Current password"
      />
      <TextInput
        placeholder="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        placeholderTextColor="#9ca3af"
        style={styles.input}
        accessibilityLabel="New password"
      />
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={changePassword}
        disabled={saving}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Update password</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={confirmLogout} accessibilityRole="button">
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#111827", marginTop: 20, marginBottom: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowLabel: { fontSize: 14, color: "#6b7280" },
  rowValue: { fontSize: 14, fontWeight: "500", color: "#111827", flexShrink: 1, marginLeft: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  logout: {
    marginTop: 28,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff",
  },
  logoutText: { color: "#dc2626", fontWeight: "600", fontSize: 15 },
});
