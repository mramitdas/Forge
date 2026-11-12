import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { GroupedList, GroupedRow, Screen, confirmAction } from "@/ui";
import { useTheme } from "@/theme/theme-context";
import { textStyles } from "@/ui/theme";

export function SettingsScreen() {
  const { me, logout } = useAuth();
  const { palette } = useTheme();
  const t = textStyles(palette);
  const router = useRouter();

  const onLogout = async () => {
    const ok = await confirmAction({
      title: "Sign out of Forge on this device?",
      confirm: "Log Out",
      destructive: true,
    });
    if (ok) await logout();
  };

  return (
    <Screen title="Settings">
      <GroupedList header="ACCOUNT">
        <GroupedRow title="Name" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{me?.user?.full_name ?? "—"}</Text>} />
        <GroupedRow title="Email" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{me?.user?.email ?? "—"}</Text>} />
        <GroupedRow title="Gym" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{me?.tenant_name ?? "—"}</Text>} />
        <GroupedRow title="Role" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{me?.role_name ?? "—"}</Text>} />
        <GroupedRow title="Branch" trailing={<Text style={[t.body, styles.value, { color: palette.secondary }]}>{me?.branches?.[0]?.name ?? "—"}</Text>} last />
      </GroupedList>
      <GroupedList header="SECURITY">
        <GroupedRow
          title="Change Password"
          chevron
          onPress={() => router.push("/(tabs)/more/settings-password")}
        />
        <GroupedRow
          title="Appearance"
          chevron
          onPress={() => router.push("/(tabs)/more/settings-appearance")}
          last
        />
      </GroupedList>
      <GroupedList>
        <GroupedRow title="Log Out" destructive onPress={() => void onLogout()} last />
      </GroupedList>
    </Screen>
  );
}

const styles = StyleSheet.create({
  value: {},
});