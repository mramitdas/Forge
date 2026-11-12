import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { GroupedList, GroupedRow, Screen } from "@/ui";
import { colors, radius } from "@/ui/tokens";

function Glyph({ name, bg }: { name: keyof typeof Ionicons.glyphMap; bg: string }) {
  return (
    <View style={[styles.glyph, { backgroundColor: bg }]}>
      <Ionicons name={name} size={18} color={colors.surface} />
    </View>
  );
}

export function MoreScreen() {
  const { me } = useAuth();
  const router = useRouter();

  const unreadQ = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    enabled: !!me,
    refetchInterval: 30000,
  });

  const unread = unreadQ.data?.count ?? 0;

  return (
    <Screen title="More">
      <GroupedList header="CHECK-IN">
        <GroupedRow
          title="Check In"
          leading={<Glyph name="calendar" bg={colors.tint} />}
          chevron
          onPress={() => router.push("/(tabs)/more/checkin")}
          last
        />
      </GroupedList>
      <GroupedList header="MONEY">
        <GroupedRow
          title="Billing"
          leading={<Glyph name="card" bg={colors.green} />}
          chevron
          onPress={() => router.push("/(tabs)/more/billing")}
        />
        <GroupedRow
          title="Expenses"
          leading={<Glyph name="remove-circle" bg={colors.red} />}
          chevron
          onPress={() => router.push("/(tabs)/more/expenses")}
          last
        />
      </GroupedList>
      <GroupedList header="ACTIVITY">
        <GroupedRow
          title="Notifications"
          leading={<Glyph name="notifications" bg={colors.amber} />}
          trailing={unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : undefined}
          chevron
          onPress={() => router.push("/(tabs)/more/notifications")}
          last
        />
      </GroupedList>
      <GroupedList header="ACCOUNT">
        <GroupedRow
          title="Settings"
          subtitle={me?.user?.full_name}
          leading={<Glyph name="settings" bg={colors.secondary} />}
          chevron
          onPress={() => router.push("/(tabs)/more/settings")}
          last
        />
      </GroupedList>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: 29,
    height: 29,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.surface, fontSize: 12, fontWeight: "600" },
});
