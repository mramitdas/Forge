"use client";

import { useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { PageOut, MemberOut } from "@/lib/types";

export function MembersScreen() {
  const { me } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["members", "list", search],
    queryFn: () =>
      apiFetch<PageOut<MemberOut>>(
        `/members?page_size=50${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: !!me,
  });

  const renderItem = ({ item }: { item: MemberOut }) => (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.first_name || item.full_name || "?").charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.name} numberOfLines={1}>
          {item.full_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.phone || item.email || "No contact"}
        </Text>
      </View>
      <View style={[styles.badge, item.status === "active" ? styles.badgeActive : styles.badgeOther]}>
        <Text style={styles.badgeText}>{item.status}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Members</Text>
      <TextInput
        placeholder="Search members"
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        style={styles.search}
        accessibilityLabel="Search members"
      />

      {isLoading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No members found.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 20 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  loader: { marginTop: 32 },
  list: { paddingBottom: 24 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 32, fontSize: 14 },
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "700", color: "#374151", fontSize: 15 },
  rowInfo: { flex: 1, marginLeft: 12 },
  name: { fontSize: 15, fontWeight: "600", color: "#111827" },
  meta: { fontSize: 13, color: "#6b7280", marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeActive: { backgroundColor: "#d1fae5" },
  badgeOther: { backgroundColor: "#f3f4f6" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#374151" },
});
