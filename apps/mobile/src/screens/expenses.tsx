"use client";

import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatMoney, formatDate } from "@/lib/money";
import type { ExpenseYearOut, ExpenseOut } from "@/lib/types";

const CATEGORIES = ["operations", "maintenance", "utilities", "supplies", "other"];
const METHODS = ["cash", "card", "upi", "netbanking", "credit", "wallet"];

export function ExpensesScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState(METHODS[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", "list"],
    queryFn: () => apiFetch<ExpenseYearOut>("/expenses?page_size=50"),
    enabled: !!me,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ExpenseOut>("/expenses", {
        method: "POST",
        body: JSON.stringify({
          category,
          description: description || null,
          amount_minor: Math.round(parseFloat(amount || "0") * 100),
          method,
          branch_id: me?.branches?.[0]?.id ?? null,
          paid_at: new Date().toISOString(),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setAmount("");
      setDescription("");
      Alert.alert("Expense recorded", "The expense was saved.");
    },
    onError: (error: any) => {
      Alert.alert("Could not save", error?.detail?.error ?? error?.message ?? "Request failed");
    },
  });

  const amountValid = parseFloat(amount || "0") > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Expenses</Text>

      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.chip, category === c && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Amount</Text>
      <TextInput
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholderTextColor="#9ca3af"
        style={styles.input}
        accessibilityLabel="Amount"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        placeholder="What was this for?"
        value={description}
        onChangeText={setDescription}
        placeholderTextColor="#9ca3af"
        style={styles.input}
        accessibilityLabel="Description"
      />

      <Text style={styles.label}>Method</Text>
      <View style={styles.chips}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMethod(m)}
            style={[styles.chip, method === m && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.submit, (!amountValid || create.isPending) && styles.submitDisabled]}
        disabled={!amountValid || create.isPending}
        onPress={() => create.mutate()}
        accessibilityRole="button"
      >
        {create.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Record Expense</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>
        Recent{data?.total ? ` · ${formatMoney(data.total)}` : ""}
      </Text>
      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={data?.expenses ?? []}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{item.category}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {item.description || item.method} · {formatDate(item.paid_at)}
                </Text>
              </View>
              <Text style={styles.rowAmount}>{formatMoney(item.amount_minor, item.currency)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No expenses recorded.</Text>}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 6, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  submit: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginTop: 28, marginBottom: 10 },
  loader: { marginTop: 20 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 20, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowMeta: { fontSize: 12, color: "#6b7280", marginTop: 1 },
  rowAmount: { fontSize: 15, fontWeight: "700", color: "#111827", marginLeft: 10 },
});
