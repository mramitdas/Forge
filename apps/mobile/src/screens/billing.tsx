"use client";

import { useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatMoney, formatDate } from "@/lib/money";
import type { PageOut, InvoiceOut } from "@/lib/types";

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "#d1fae5", fg: "#047857" },
  pending: { bg: "#fef3c7", fg: "#b45309" },
  overdue: { bg: "#fee2e2", fg: "#b91c1c" },
  void: { bg: "#f3f4f6", fg: "#4b5563" },
};

export function BillingScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "list", filter],
    queryFn: () =>
      apiFetch<PageOut<InvoiceOut>>(
        `/invoices?page_size=50${filter ? `&status=${filter}` : ""}`,
      ),
    enabled: !!me,
  });

  const pay = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch(`/invoices/${invoiceId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          method: "cash",
          idempotency_key: `mob-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      Alert.alert("Payment captured", "Invoice marked as paid.");
    },
    onError: (error: any) => {
      Alert.alert("Payment failed", error?.detail?.error ?? error?.message ?? "Request failed");
    },
  });

  const filters = [null, "pending", "overdue", "paid"];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Billing</Text>

      <View style={styles.filters}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f ?? "all"}
            onPress={() => setFilter(f)}
            style={[styles.filter, filter === f && styles.filterActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const s = STATUS_STYLES[item.status] ?? STATUS_STYLES.void;
            const outstanding = item.total_minor - item.paid_minor;
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.number}>{item.number}</Text>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.fg }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.amount}>{formatMoney(item.total_minor, item.currency)}</Text>
                <Text style={styles.meta}>Due {formatDate(item.due_date)}</Text>
                {outstanding > 0 && item.status !== "void" ? (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => pay.mutate(item.id)}
                    disabled={pay.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={styles.payText}>
                      {pay.isPending ? "Processing…" : `Pay ${formatMoney(outstanding, item.currency)}`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No invoices.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 20 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 12 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 14 },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  filterActive: { backgroundColor: "#111827", borderColor: "#111827" },
  filterText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  loader: { marginTop: 32 },
  list: { paddingBottom: 24 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 32, fontSize: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  number: { fontSize: 15, fontWeight: "600", color: "#111827" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  amount: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 6 },
  meta: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  payBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  payText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
