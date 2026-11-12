import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatDate, formatMoney } from "@/lib/money";
import type { ExpenseOut, ExpenseYearOut } from "@/lib/types";
import { Empty, ErrorRetry, GroupedList, GroupedRow, RowSkeleton, Screen } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function groupByMonth(expenses: ExpenseOut[]) {
  const groups: { header: string; items: ExpenseOut[] }[] = [];
  for (const e of expenses) {
    const header = monthLabel(e.paid_at);
    const last = groups[groups.length - 1];
    if (last && last.header === header) last.items.push(e);
    else groups.push({ header, items: [e] });
  }
  return groups;
}

export function ExpensesScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();
  const year = new Date().getFullYear();

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["expenses", "list"],
    queryFn: () => apiFetch<ExpenseYearOut>("/expenses?page_size=50"),
    enabled: !!me,
  });

  const groups = groupByMonth(data?.expenses ?? []);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Expenses",
          headerRight: () => (
            <View style={styles.headerRight}>
              <Text style={[t.footnote, styles.year]}>{year}</Text>
              <Text
                onPress={() => router.push("/(tabs)/more/expense-add")}
                style={[t.title, styles.add, { color: palette.accent, fontWeight: "400" as const }]}
                accessibilityRole="button"
              >
                Add
              </Text>
            </View>
          ),
        }}
      />
      <Screen
        title="Expenses"
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
      >
        {isError ? (
          <ErrorRetry onPress={() => void refetch()} />
        ) : isLoading ? (
          <GroupedList>
            {Array.from({ length: 8 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </GroupedList>
        ) : groups.length === 0 ? (
          <Empty label="No Expenses" />
        ) : (
          groups.map((g) => (
            <GroupedList key={g.header} header={g.header.toUpperCase()}>
              {g.items.map((item, i) => (
                <GroupedRow
                  key={item.id}
                  title={titleCase(item.category)}
                  subtitle={item.description || formatDate(item.paid_at)}
                  trailing={
                    <Text style={[t.body, styles.amount, { color: palette.secondary }]}>{formatMoney(item.amount_minor, item.currency)}</Text>
                  }
                  last={i === g.items.length - 1}
                />
              ))}
            </GroupedList>
          ))
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: "row", alignItems: "center", gap: space.md },
  year: {},
  add: {},
  amount: {},
});