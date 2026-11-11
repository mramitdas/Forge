"use client";

import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import type { PageOut, MemberOut, InvoiceSummaryOut } from "@/lib/types";

export function DashboardScreen() {
  const { me } = useAuth();
  const router = useRouter();

  const membersQ = useQuery({
    queryKey: ["members", "count"],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=1"),
    enabled: !!me,
  });

  const summaryQ = useQuery({
    queryKey: ["invoices", "summary"],
    queryFn: () => apiFetch<InvoiceSummaryOut>("/invoices/summary"),
    enabled: !!me,
  });

  const loading = membersQ.isLoading || summaryQ.isLoading;

  const stats = [
    {
      label: "Members",
      value: membersQ.data?.total != null ? String(membersQ.data.total) : "—",
      route: "/(tabs)/members",
    },
    {
      label: "Outstanding",
      value: summaryQ.data ? formatMoney(summaryQ.data.outstanding_minor) : "—",
      route: "/(tabs)/billing",
    },
    {
      label: "Overdue",
      value: summaryQ.data ? formatMoney(summaryQ.data.overdue_minor) : "—",
      route: "/(tabs)/billing",
    },
  ];

  const actions = [
    { label: "Check In", route: "/(tabs)/checkin" },
    { label: "Add Expense", route: "/(tabs)/expenses" },
    { label: "Billing", route: "/(tabs)/billing" },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {me?.user?.full_name ? `Hi, ${me.user.full_name}` : "Welcome"}
        </Text>
        <Text style={styles.tenant}>{me?.tenant_name ?? ""}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={styles.statCard}
              onPress={() => router.push(s.route as never)}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}: ${s.value}`}
            >
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actions}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionButton}
            onPress={() => router.push(a.route as never)}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#f9fafb", padding: 20 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 24, fontWeight: "700", color: "#111827" },
  tenant: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  loader: { marginVertical: 32 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 },
  actions: { gap: 10 },
  actionButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  actionText: { fontSize: 15, fontWeight: "500", color: "#111827" },
});
