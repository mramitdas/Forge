import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import type { MemberOut, PageOut } from "@/lib/types";
import { Empty, ErrorRetry, GroupedRow, RowSkeleton, Screen, SearchBar, StatusCaption } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, radius, space } from "@/ui/theme";

function InitialAvatar({ name }: { name: string }) {
  const { palette } = useTheme();
  const t = textStyles(palette);
  const letter = (name || "?").charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: palette.surfaceStrong }]}>
      <Text style={[t.title, styles.avatarText, { color: palette.label }]}>{letter}</Text>
    </View>
  );
}

export function MembersScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
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
    overflow: "hidden",
    paddingBottom: 0,
  },
  group: {
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15 },
});