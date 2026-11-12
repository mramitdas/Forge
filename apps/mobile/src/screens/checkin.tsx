import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { formatTime } from "@/lib/money";
import type { CheckInOut, MemberOut, PageOut } from "@/lib/types";
import {
  Empty,
  GroupedList,
  GroupedRow,
  Screen,
  SearchBar,
  StatusCaption,
} from "@/ui";
import { colors, radius, space, type as typeStyle } from "@/ui/tokens";

export function CheckInScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [search, setSearch] = useState("");

  const branch = me?.branches?.[0];
  const branchId = branch?.id ?? "";

  const membersQ = useQuery({
    queryKey: ["members", "checkin-picker", search],
    queryFn: () =>
      apiFetch<PageOut<MemberOut>>(
        `/members?page_size=20${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: !!me,
  });

  const recentQ = useQuery({
    queryKey: ["checkins", "recent"],
    queryFn: () => apiFetch<PageOut<CheckInOut>>("/checkin?page_size=10"),
    enabled: !!me,
    refetchInterval: 15000,
  });

  const membersListQ = useQuery({
    queryKey: ["members", "list", ""],
    queryFn: () => apiFetch<PageOut<MemberOut>>("/members?page_size=50"),
    enabled: !!me,
  });

  const checkin = useMutation({
    mutationFn: (body: { member_id: string; branch_id: string; source: string }) =>
      apiFetch<CheckInOut>("/checkin", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["checkins"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
      setMemberId("");
      if (data.result === "allowed") {
        Alert.alert("Checked In", "Member checked in.");
      } else {
        Alert.alert("Not Allowed", data.reason ?? `Result: ${data.result}`);
      }
    },
    onError: (error) => {
      Alert.alert(
        "Check-in failed",
        error instanceof ApiError ? (error.message ?? "Request failed") : "Request failed",
      );
    },
  });

  const members = membersQ.data?.items ?? [];
  const recent = recentQ.data?.items ?? [];
  const canSubmit = !!memberId && !!branchId && !checkin.isPending;
  const memberName = (id: string) =>
    membersListQ.data?.items.find((m) => m.id === id)?.full_name ?? "Member";

  const footer = (
    <View style={styles.footer}>
      <TouchableOpacity
        disabled={!canSubmit}
        onPress={() => checkin.mutate({ member_id: memberId, branch_id: branchId, source: "manual" })}
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        accessibilityRole="button"
      >
        {checkin.isPending ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitText}>Check In</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen
      title="Check In"
      footer={footer}
      onRefresh={() => {
        void membersQ.refetch();
        void recentQ.refetch();
      }}
      refreshing={membersQ.isRefetching || recentQ.isRefetching}
    >
      <Text style={styles.kicker}>{branch ? `Branch: ${branch.name}` : "No branch assigned"}</Text>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search member"
        accessibilityLabel="Search member"
      />

      <GroupedList>
        {membersQ.isLoading ? (
          <GroupedRow title="Loading…" last />
        ) : members.length === 0 ? (
          <Empty label="No members match." />
        ) : (
          members.map((m, i) => (
            <GroupedRow
              key={m.id}
              title={m.full_name}
              subtitle={m.status}
              trailing={
                memberId === m.id ? (
                  <Ionicons name="checkmark" size={20} color={colors.tint} />
                ) : undefined
              }
              onPress={() => setMemberId((cur) => (cur === m.id ? "" : m.id))}
              last={i === members.length - 1}
            />
          ))
        )}
      </GroupedList>

      <GroupedList header="RECENTS">
        {recent.length === 0 ? (
          <Empty label="No check-ins yet." />
        ) : (
          recent.map((c, i) => (
            <GroupedRow
              key={c.id}
              title={memberName(c.member_id)}
              subtitle={`${c.result} · ${formatTime(c.recorded_at)}`}
              trailing={<StatusCaption status={c.result} />}
              last={i === recent.length - 1}
            />
          ))
        )}
      </GroupedList>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    ...typeStyle.footnote,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  footer: {
    padding: space.lg,
    backgroundColor: colors.canvas,
  },
  submit: {
    height: 50,
    backgroundColor: colors.tint,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: colors.surface, fontWeight: "600", fontSize: 17 },
});
