import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatTime } from "@/lib/money";
import type { NotificationPageOut } from "@/lib/types";
import { Empty, ErrorRetry, GroupedList, GroupedRow, RowSkeleton, Screen } from "@/ui";
import { colors, type as typeStyle } from "@/ui/tokens";

export function NotificationsScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => apiFetch<NotificationPageOut>("/notifications?page_size=50"),
    enabled: !!me,
    refetchInterval: 30000,
  });

  const unreadQ = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    enabled: !!me,
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch("/notifications/mark-all", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = unreadQ.data?.count ?? 0;
  const items = data?.items ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight:
            unread > 0
              ? () => (
                  <Text
                    onPress={() => markAll.mutate()}
                    style={styles.markAll}
                    accessibilityRole="button"
                  >
                    Mark All Read
                  </Text>
                )
              : undefined,
        }}
      />
      <Screen
        title="Notifications"
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
        ) : items.length === 0 ? (
          <Empty label="No Notifications" />
        ) : (
          <GroupedList>
            {items.map((item, i) => (
              <GroupedRow
                key={item.id}
                title={item.title}
                subtitle={item.body ? item.body : formatTime(item.created_at)}
                leading={!item.read_at ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                onPress={() => {
                  if (!item.read_at) markRead.mutate(item.id);
                }}
                last={i === items.length - 1}
              />
            ))}
          </GroupedList>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  markAll: { ...typeStyle.footnote, color: colors.tint },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tint,
  },
  dotSpacer: { width: 8, height: 8 },
});
