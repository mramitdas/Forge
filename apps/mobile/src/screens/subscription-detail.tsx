import { Alert, StyleSheet, Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { activateSubscription, fetchSubscriptions } from "@/lib/subscriptions";
import { formatDate, formatMoney } from "@/lib/money";
import { useAuth } from "@/auth/auth-context";
import type { MemberOut, PageOut, PlanOut, SubscriptionOut } from "@/lib/types";
import { ErrorRetry, GroupedList, GroupedRow, Screen, StatusCaption, confirmAction } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";

export function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const qc = useQueryClient();
  const transformed = me?.permissions.includes("membership.manage") ?? false;

  const listQ = useQuery({
    queryKey: ["subscriptions", "list", "All"],
    queryFn: () => fetchSubscriptions(),
    enabled: !!me,
  });

  const plansQ = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiFetch<PlanOut[]>("/plans"),
    enabled: !!me,
  });

  const membersQ = useQuery({
    queryKey: ["members", "list", ""],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=50"),
    enabled: !!me,
  });

  const sub: SubscriptionOut | undefined = listQ.data?.items.find((s) => s.id === id);

  const activate = useMutation({
    mutationFn: activateSubscription,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error: any) => {
      Alert.alert("Could not activate", error?.message ?? "Request failed");
    },
  });

  const memberName = membersQ.data?.items.find((m) => m.id === sub?.member_id)?.full_name ?? "Member";
  const planName = plansQ.data?.find((p) => p.id === sub?.plan_id)?.name ?? "Plan";
  const branchName = me?.branches.find((b) => b.id === sub?.branch_id)?.name ?? "—";

  const onActivate = async () => {
    if (!sub) return;
    const ok = await confirmAction({ title: "Activate subscription?", confirm: "Activate" });
    if (ok) activate.mutate(sub.id);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Subscription" }} />
      <Screen title="Subscription">
        {listQ.isError || (!listQ.isLoading && !sub) ? (
          <ErrorRetry onPress={() => void listQ.refetch()} />
        ) : !sub ? null : (
          <>
            <GroupedList header="MEMBER">
              <GroupedRow title="Name" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{memberName}</Text>} last />
            </GroupedList>
            <GroupedList header="PLAN">
              <GroupedRow title="Plan" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{planName}</Text>} />
              <GroupedRow
                title="Price"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatMoney(sub.price_minor, sub.currency)}</Text>}
                last
              />
            </GroupedList>
            <GroupedList header="STATUS">
              <GroupedRow title="Status" trailing={<StatusCaption status={sub.status} />} />
              <GroupedRow
                title="Auto-renew"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{sub.auto_renew ? "On" : "Off"}</Text>}
                last
              />
            </GroupedList>
            <GroupedList header="DATES">
              <GroupedRow title="Start" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatDate(sub.start_at)}</Text>} />
              <GroupedRow
                title="End"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{sub.end_at ? formatDate(sub.end_at) : "Open"}</Text>}
                last
              />
            </GroupedList>
            <GroupedList header="BRANCH">
              <GroupedRow title="Branch" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{branchName}</Text>} last />
            </GroupedList>
            {sub.status === "pending" && transformed ? (
              <GroupedList>
                <GroupedRow title="Activate" onPress={() => void onActivate()} last />
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