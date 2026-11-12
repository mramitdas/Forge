import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatDate } from "@/lib/money";
import type { MemberOut } from "@/lib/types";
import { ErrorRetry, GroupedList, GroupedRow, Screen, StatusCaption } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles, space } from "@/ui/theme";

export function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);

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
            <View style={[styles.hero, { marginBottom: space.lg, marginTop: space.sm }]}>
              <View style={[styles.avatar, { backgroundColor: palette.surfaceStrong }]}>
                <Text style={[t.largeTitle, styles.avatarText, { color: palette.label }]}>{letter}</Text>
              </View>
            </View>
            <GroupedList header="CONTACT">
              <GroupedRow title="Phone" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{data.phone || "—"}</Text>} />
              <GroupedRow title="Email" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{data.email || "—"}</Text>} last />
            </GroupedList>
            <GroupedList header="STATUS">
              <GroupedRow title="Status" trailing={<StatusCaption status={data.status} />} />
              <GroupedRow title="Branch" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{branchName}</Text>} last />
            </GroupedList>
            <GroupedList header="DATES">
              <GroupedRow
                title="Joined"
                trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{formatDate(data.joined_at)}</Text>}
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
  hero: { alignItems: "center" },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 24 },
  value: {},
});