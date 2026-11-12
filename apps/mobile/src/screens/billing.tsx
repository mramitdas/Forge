import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatDate, formatMoney } from "@/lib/money";
import type { InvoiceOut, PageOut } from "@/lib/types";
import {
  Empty,
  ErrorRetry,
  GroupedRow,
  RowSkeleton,
  Screen,
  Segmented,
  StatusCaption,
  confirmAction,
} from "@/ui";
import { colors, radius, space, type as typeStyle } from "@/ui/tokens";

const SEGMENTS = ["All", "Pending", "Overdue", "Paid"];

export function payInvoice(invoiceId: string) {
  return apiFetch(`/invoices/${invoiceId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      method: "cash",
      idempotency_key: `mob-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    }),
  });
}

export function BillingScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const status = filter === "All" ? null : filter.toLowerCase();

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["invoices", "list", filter],
    queryFn: () =>
      apiFetch<PageOut<InvoiceOut>>(
        `/invoices?page_size=50${status ? `&status=${status}` : ""}`,
      ),
    enabled: !!me,
  });

  const pay = useMutation({
    mutationFn: payInvoice,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      Alert.alert("Payment captured", "Invoice marked as paid.");
    },
    onError: (error: any) => {
      Alert.alert("Payment failed", error?.detail?.error ?? error?.message ?? "Request failed");
    },
  });

  const items = data?.items ?? [];

  const onPay = async (id: string) => {
    const ok = await confirmAction({ title: "Record cash payment?", confirm: "Pay" });
    if (ok) pay.mutate(id);
  };

  return (
    <Screen scroll={false} title="Billing">
      <Segmented values={SEGMENTS} value={filter} onChange={setFilter} />
      {isError ? (
        <ErrorRetry onPress={() => void refetch()} />
      ) : isLoading ? (
        <View style={styles.group}>
          {Array.from({ length: 8 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={<Empty label="No Invoices" />}
          renderItem={({ item, index }) => {
            const outstanding = item.total_minor - item.paid_minor;
            const unpaid = outstanding > 0 && item.status !== "paid" && item.status !== "void";
            const row = (
              <GroupedRow
                title={item.number}
                subtitle={`Due ${formatDate(item.due_date)}`}
                trailing={
                  <View style={styles.trailing}>
                    <Text style={styles.amount}>
                      {formatMoney(item.status === "paid" ? item.total_minor : outstanding, item.currency)}
                    </Text>
                    <StatusCaption status={item.status} />
                  </View>
                }
                onPress={() => router.push(`/(tabs)/more/billing/${item.id}`)}
                last={index === items.length - 1}
              />
            );
            if (!unpaid) return row;
            return (
              <Swipeable
                renderRightActions={() => (
                  <Pressable
                    onPress={() => void onPay(item.id)}
                    style={styles.payAction}
                    accessibilityRole="button"
                  >
                    <Text style={styles.payText}>Pay</Text>
                  </Pressable>
                )}
              >
                {row}
              </Swipeable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  group: {
    marginHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  trailing: { alignItems: "flex-end" },
  amount: { ...typeStyle.caption, color: colors.label, marginBottom: 2 },
  payAction: {
    backgroundColor: colors.green,
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  payText: { color: colors.surface, fontWeight: "600", fontSize: 17 },
});
