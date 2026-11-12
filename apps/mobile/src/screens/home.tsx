import { Text, StyleSheet } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { apiFetch } from "@/lib/api";
import { formatDay, formatMoney, formatTime } from "@/lib/money";
import type { CheckInOut, InvoiceSummaryOut, MemberOut, PageOut } from "@/lib/types";
import {
  Empty,
  ErrorRetry,
  GroupedList,
  GroupedRow,
  RowSkeleton,
  Screen,
  StatusCaption,
  SummaryCard,
  SummaryCardSkeleton,
} from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

export function HomeScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();
  const qc = useQueryClient();

  const membersCountQ = useQuery({
    queryKey: ["members", "count"],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=1"),
    enabled: !!me,
  });

  const summaryQ = useQuery({
    queryKey: ["invoices", "summary"],
    queryFn: () => apiFetch<InvoiceSummaryOut>("/invoices/summary"),
    enabled: !!me,
  });

  const recentQ = useQuery({
    queryKey: ["checkins", "recent"],
    queryFn: () => apiFetch<PageOut<CheckInOut>>("/checkin?page_size=10"),
    enabled: !!me,
  });

  const membersListQ = useQuery({
    queryKey: ["members", "list", ""],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=50"),
    enabled: !!me,
  });

  const loading = membersCountQ.isLoading || summaryQ.isLoading || recentQ.isLoading;
  const errored = membersCountQ.isError || summaryQ.isError || recentQ.isError;
  const overdue = summaryQ.data?.overdue_minor ?? 0;

  const memberName = (id: string) =>
    membersListQ.data?.items.find((m) => m.id === id)?.full_name ?? "Member";

  const recents = recentQ.data?.items ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["members"] });
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["checkins"] });
  };

  return (
    <Screen
      title="Summary"
      onRefresh={refresh}
      refreshing={membersCountQ.isRefetching || summaryQ.isRefetching || recentQ.isRefetching}
    >
      <Text style={[t.footnote, styles.kicker]}>
        {[me?.tenant_name, formatDay()].filter(Boolean).join(" · ")}
      </Text>

      {errored ? (
        <ErrorRetry onPress={refresh} />
      ) : loading ? (
        <>
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
          <GroupedList header="RECENTS">
            {Array.from({ length: 6 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </GroupedList>
        </>
      ) : (
        <>
          <SummaryCard
            value={membersCountQ.data?.total != null ? String(membersCountQ.data.total) : "—"}
            caption="on file"
            onPress={() => router.push("/(tabs)/members")}
          />
          <SummaryCard
            value={summaryQ.data ? formatMoney(summaryQ.data.outstanding_minor) : "—"}
            caption="unpaid invoices"
            onPress={() => router.push("/(tabs)/more/billing")}
          />
          <SummaryCard
            value={summaryQ.data ? formatMoney(overdue) : "—"}
            caption="past due"
            valueColor={overdue > 0 ? palette.danger : undefined}
            onPress={() => router.push("/(tabs)/more/billing")}
          />

          <GroupedList header="RECENTS">
            {recents.length === 0 ? (
              <Empty label="No check-ins yet." />
            ) : (
              recents.map((c, i) => (
                <GroupedRow
                  key={c.id}
                  title={memberName(c.member_id)}
                  subtitle={`${c.result} · ${formatTime(c.recorded_at)}`}
                  trailing={<StatusCaption status={c.result} />}
                  last={i === recents.length - 1}
                />
              ))
            )}
          </GroupedList>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
});