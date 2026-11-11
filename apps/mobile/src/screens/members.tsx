import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { MemberOut, PageOut } from "@/lib/types";
import { Empty, ErrorRetry, GroupedRow, RowSkeleton, Screen, SearchBar, StatusCaption } from "@/ui";
import { colors, radius, space, type as typeStyle } from "@/ui/tokens";

function InitialAvatar({ name }: { name: string }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{letter}</Text>
    </View>
  );
}

export function MembersScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["members", "list", search],
    queryFn: () =>
      apiFetch<PageOut<MemberOut>>(
        `/members?page_size=50${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: !!me,
  });

  const items = data?.items ?? [];

  return (
    <Screen scroll={false} title="Members">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search members"
        accessibilityLabel="Search members"
      />
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
          ListEmptyComponent={<Empty label="No Members" />}
          renderItem={({ item, index }) => (
            <GroupedRow
              title={item.full_name}
              subtitle={item.phone || item.email || "No contact"}
              leading={<InitialAvatar name={item.first_name || item.full_name} />}
              trailing={<StatusCaption status={item.status} />}
              onPress={() => router.push(`/(tabs)/members/${item.id}`)}
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    paddingBottom: 0,
  },
  group: {
    marginHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typeStyle.title, fontSize: 15 },
});
