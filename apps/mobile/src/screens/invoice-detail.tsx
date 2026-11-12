import { Alert, StyleSheet, Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/money";
import { useAuth } from "@/auth/auth-context";
import type { InvoiceOut, MemberOut, PageOut } from "@/lib/types";
import { ErrorRetry, GroupedList, GroupedRow, Screen, StatusCaption, confirmAction } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";
import { payInvoice } from "@/screens/billing";

export function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const qc = useQueryClient();
  const { palette } = useTheme();
  const t = textStyles(palette);

  const listQ = useQuery({
    queryKey: ["invoices", "list", "All"],
    queryFn: () => apiFetch<PageOut<InvoiceOut>>("/invoices?page_size=50"),
    enabled: !!me,
  });

  const cached = qc.getQueriesData<PageOut<InvoiceOut>>({ queryKey: ["invoices", "list"] });

  const membersQ = useQuery({
    queryKey: ["members", "list", ""],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=50"),
    enabled: !!me,
  });

  const invoice =
    listQ.data?.items.find((i) => i.id === id) ??
    cached.flatMap(([, page]) => page?.items ?? []).find((i) => i.id === id);

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

  const memberName =
    membersQ.data?.items.find((m) => m.id === invoice?.member_id)?.full_name ?? invoice?.member_id ?? "—";
  const outstanding = invoice ? invoice.total_minor - invoice.paid_minor : 0;
  const unpaid = !!invoice && outstanding > 0 && invoice.status !== "paid" && invoice.status !== "void";

  const onPay = async () => {
    if (!invoice) return;
    const ok = await confirmAction({ title: "Record cash payment?", confirm: "Pay" });
    if (ok) pay.mutate(invoice.id);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Invoice" }} />
      <Screen title="Invoice">
        {listQ.isError || (!listQ.isLoading && !invoice) ? (
          <ErrorRetry onPress={() => void listQ.refetch()} />
        ) : !invoice ? null : (
          <>
            <GroupedList header="INVOICE">
              <GroupedRow title="Number" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{invoice.number}</Text>} />
              <GroupedRow title="Member" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{memberName}</Text>} />
              <GroupedRow title="Status" trailing={<StatusCaption status={invoice.status} />} last />
            </GroupedList>
            <GroupedList header="DATES">
              <GroupedRow title="Issued" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatDate(invoice.issue_date)}</Text>} />
              <GroupedRow title="Due" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatDate(invoice.due_date)}</Text>} last />
            </GroupedList>
            <GroupedList header="AMOUNTS">
              <GroupedRow
                title="Total"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatMoney(invoice.total_minor, invoice.currency)}</Text>}
              />
              <GroupedRow
                title="Paid"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatMoney(invoice.paid_minor, invoice.currency)}</Text>}
              />
              <GroupedRow
                title="Outstanding"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatMoney(outstanding, invoice.currency)}</Text>}
                last
              />
            </GroupedList>
            {unpaid ? (
              <GroupedList>
                <GroupedRow title="Pay Cash" onPress={() => void onPay()} last />
              </GroupedList>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  value: {},
});