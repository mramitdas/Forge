import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { activateSubscription, fetchSubscriptions } from "@/lib/subscriptions";
import { formatDate } from "@/lib/money";
import { useAuth } from "@/auth/auth-context";
import type { MemberOut, PageOut, PlanOut } from "@/lib/types";
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
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

const SEGMENTS = ["All", "Active", "Pending", "Expired", "Cancelled"];

export function SubscriptionsScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("All");
  const status = filter === "All" ? undefined : filter.toLowerCase();
  const transformed = me?.permissions.includes("membership.manage") ?? false;

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["subscriptions", "list", filter],
    queryFn: () => fetchSubscriptions(status),
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

  const activate = useMutation({
    mutationFn: activateSubscription,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error: any) => {
      Alert.alert("Could not activate", error?.message ?? "Request failed");
    },
  });

  const memberName = (id: string) =>
    membersQ.data?.items.find((m) => m.id === id)?.full_name ?? "Member";
  const planName = (id: string) => plansQ.data?.find((p) => p.id === id)?.name ?? "Plan";

  const items = data?.items ?? [];

  const onActivate = async (id: string) => {
    const ok = await confirmAction({ title: "Activate subscription?", confirm: "Activate" });
    if (ok) activate.mutate(id);
  };

  return (
    <Screen scroll={false} title="Subscriptions">
      <Segmented values={SEGMENTS} value={filter} onChange={setFilter} />
      {isError ? (
        <ErrorRetry onPress={() => void refetch()} />
      ) : isLoading ? (
        <View style={[styles.group, { backgroundColor: palette.surface, borderRadius: radius.md, overflow: "hidden" as const }]}>
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
          ListEmptyComponent={<Empty label="No Subscriptions" />}
          renderItem={({ item, index }) => (
            <GroupedRow
              title={memberName(item.member_id)}
              subtitle={`${planName(item.plan_id)} · ${formatDate(item.start_at)}–${item.end_at ? formatDate(item.end_at) : "open"}`}
              trailing={
                <View style={styles.trailing}>
                  {item.status === "pending" && transformed ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void onActivate(item.id);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={[t.footnote, styles.activate, { color: palette.accent, fontWeight: "600" as const }]}>Activate</Text>
                    </Pressable>
                  ) : null}
                  <StatusCaption status={item.status} />
                </View>
              }
              onPress={() => router.push(`/(tabs)/subscriptions/${item.id}`)}
              last={index === items.length - 1}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  group: {
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.sm },
  activate: {},
});