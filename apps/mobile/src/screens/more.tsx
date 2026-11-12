import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { GroupedList, GroupedRow, Screen } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { radius, space } from "@/ui/theme";

function Glyph({ name, bg }: { name: keyof typeof Ionicons.glyphMap; bg: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: bg }]}>
      <Ionicons name={name} size={18} color={palette.onAccent} />
    </View>
  );
}

export function MoreScreen() {
  const { me } = useAuth();
  const { palette } = useTheme();
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
          leading={<Glyph name="calendar" bg={palette.accentSoft} />}
          chevron
          onPress={() => router.push("/(tabs)/more/checkin")}
          last
        />
      </GroupedList>
      <GroupedList header="MONEY">
        <GroupedRow
          title="Billing"
          leading={<Glyph name="card" bg={palette.accentSoft} />}
          chevron
          onPress={() => router.push("/(tabs)/more/billing")}
        />
        <GroupedRow
          title="Expenses"
          leading={<Glyph name="remove-circle" bg={palette.accentSoft} />}
          chevron
          onPress={() => router.push("/(tabs)/more/expenses")}
          last
        />
      </GroupedList>
      <GroupedList header="ACTIVITY">
        <GroupedRow
          title="Notifications"
          leading={<Glyph name="notifications" bg={palette.accentSoft} />}
          trailing={unread > 0 ? <View style={[styles.badge, { backgroundColor: palette.danger }]}><Text style={[styles.badgeText, { color: palette.onAccent }]}>{unread}</Text></View> : undefined}
          chevron
          onPress={() => router.push("/(tabs)/more/notifications")}
          last
        />
      </GroupedList>
      <GroupedList header="ACCOUNT">
        <GroupedRow
          title="Settings"
          subtitle={me?.user?.full_name}
          leading={<Glyph name="settings" bg={palette.accentSoft} />}
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
});