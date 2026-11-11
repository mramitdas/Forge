"use client";

import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatTime } from "@/lib/money";
import type { PageOut, MemberOut, CheckInOut } from "@/lib/types";

export function CheckInScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [search, setSearch] = useState("");

  const branch = me?.branches?.[0];
  const branchId = branch?.id ?? "";

  const membersQ = useQuery({
    queryKey: ["members", "checkin-picker", search],
    queryFn: () =>
      apiFetch<PageOut<MemberOut>>(
        `/members?page_size=20${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: !!me,
  });

  const recentQ = useQuery({
    queryKey: ["checkins", "recent"],
    queryFn: () => apiFetch<PageOut<CheckInOut>>("/checkin?page_size=10"),
    enabled: !!me,
    refetchInterval: 15000,
  });

  const checkin = useMutation({
    mutationFn: (body: { member_id: string; branch_id: string; source: string }) =>
      apiFetch<CheckInOut>("/checkin", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      setMemberId("");
      if (data.result === "allowed") {
        Alert.alert("Checked in", "Member checked in.");
      } else {
        Alert.alert("Not allowed", data.reason ?? `Result: ${data.result}`);
      }
    },
    onError: (error) => {
      Alert.alert(
        "Check-in failed",
        error instanceof ApiError ? (error.message ?? "Request failed") : "Request failed",
      );
    },
  });

  const members = membersQ.data?.items ?? [];
  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId) ?? null,
    [members, memberId],
  );
  const recent = recentQ.data?.items ?? [];
  const canSubmit = !!memberId && !!branchId && !checkin.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Check In</Text>
      <Text style={styles.subtitle}>{branch ? `Branch: ${branch.name}` : "No branch assigned"}</Text>

      <TextInput
        placeholder="Search member"
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        style={styles.search}
        accessibilityLabel="Search member"
      />

      {selectedMember ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>{selectedMember.full_name}</Text>
          <TouchableOpacity onPress={() => setMemberId("")} accessibilityRole="button">
            <Text style={styles.clear}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : membersQ.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : members.length === 0 ? (
        <Text style={styles.empty}>No members match.</Text>
      ) : (
        members.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={styles.row}
            onPress={() => setMemberId(m.id)}
            accessibilityRole="button"
          >
            <Text style={styles.rowName}>{m.full_name}</Text>
            <Text style={styles.rowMeta}>{m.status}</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity
        disabled={!canSubmit}
        onPress={() =>
          checkin.mutate({ member_id: memberId, branch_id: branchId, source: "manual" })
        }
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        accessibilityRole="button"
      >
        {checkin.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Check In</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recent check-ins</Text>
      {recent.length === 0 ? (
        <Text style={styles.empty}>No check-ins yet.</Text>
      ) : (
        recent.map((c) => (
          <View key={c.id} style={styles.recentRow}>
            <Text style={styles.recentText}>
              {c.result} · {formatTime(c.recorded_at)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 2, marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  loader: { marginTop: 24 },
  empty: { color: "#9ca3af", marginTop: 16, marginBottom: 8, fontSize: 14 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowName: { fontSize: 15, fontWeight: "500", color: "#111827", flex: 1 },
  rowMeta: { fontSize: 12, color: "#6b7280" },
  selected: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  selectedName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  clear: { fontSize: 14, color: "#4f46e5", fontWeight: "500" },
  submit: {
    backgroundColor: "#059669",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginTop: 28, marginBottom: 8 },
  recentRow: { paddingVertical: 6 },
  recentText: { fontSize: 13, color: "#6b7280" },
});
