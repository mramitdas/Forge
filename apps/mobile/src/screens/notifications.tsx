"use client";

import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatTime } from "@/lib/money";
import type { NotificationPageOut, NotificationOut } from "@/lib/types";

export function NotificationsScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
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
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch("/notifications/mark-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = unreadQ.data?.count ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>Notifications</Text>
        {unread > 0 ? (
          <TouchableOpacity
            onPress={() => markAll.mutate()}
            disabled={markAll.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {unread > 0 ? <Text style={styles.unread}>{unread} unread</Text> : null}

      {isLoading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, !item.read_at && styles.rowUnread]}
              onPress={() => {
                if (!item.read_at) markRead.mutate(item.id);
              }}
              accessibilityRole="button"
            >
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {item.body ? (
                  <Text style={styles.rowBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.rowTime}>{formatTime(item.created_at)}</Text>
              </View>
              {!item.read_at ? <View style={styles.dot} /> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No notifications.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 20 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  markAll: { fontSize: 14, color: "#4f46e5", fontWeight: "500" },
  unread: { fontSize: 13, color: "#b45309", marginTop: 4, marginBottom: 8 },
  loader: { marginTop: 32 },
  list: { paddingBottom: 24 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 32, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowUnread: { backgroundColor: "#f9fafb", borderColor: "#c7d2fe" },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowBody: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  rowTime: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4f46e5", marginLeft: 8 },
});
