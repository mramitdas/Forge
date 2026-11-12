import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatDate } from "@/lib/money";
import type { MemberOut } from "@/lib/types";
import { ErrorRetry, GroupedList, GroupedRow, Screen, StatusCaption } from "@/ui";
import { colors, space, type as typeStyle } from "@/ui/tokens";

export function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["members", "detail", id],
    queryFn: () => apiFetch<MemberOut>(`/members/${id}`),
    enabled: !!me && !!id,
  });

  const branchName =
    me?.branches.find((b) => b.id === data?.branch_id)?.name ?? "—";
  const letter = (data?.first_name || data?.full_name || "?").charAt(0).toUpperCase();

  return (
    <>
      <Stack.Screen options={{ title: data?.full_name ?? "Member" }} />
      <Screen title={data?.full_name ?? "Member"}>
        {isError || (!isLoading && !data) ? (
          <ErrorRetry onPress={() => void refetch()} />
        ) : isLoading || !data ? null : (
          <>
            <View style={styles.hero}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{letter}</Text>
              </View>
            </View>
            <GroupedList header="CONTACT">
              <GroupedRow title="Phone" trailing={<Text style={styles.value}>{data.phone || "—"}</Text>} />
              <GroupedRow title="Email" trailing={<Text style={styles.value}>{data.email || "—"}</Text>} last />
            </GroupedList>
            <GroupedList header="STATUS">
              <GroupedRow title="Status" trailing={<StatusCaption status={data.status} />} />
              <GroupedRow title="Branch" trailing={<Text style={styles.value}>{branchName}</Text>} last />
            </GroupedList>
            <GroupedList header="DATES">
              <GroupedRow
                title="Joined"
                trailing={<Text style={styles.value}>{formatDate(data.joined_at)}</Text>}
                last
              />
            </GroupedList>
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginBottom: space.lg, marginTop: space.sm },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gray5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typeStyle.largeTitle, fontSize: 24 },
  value: { ...typeStyle.body, color: colors.secondary },
});
