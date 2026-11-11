import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { GroupedList, GroupedRow, Screen, confirmAction } from "@/ui";
import { colors, type as typeStyle } from "@/ui/tokens";

export function SettingsScreen() {
  const { me, logout } = useAuth();
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
        <GroupedRow title="Name" trailing={<Text style={styles.value}>{me?.user?.full_name ?? "—"}</Text>} />
        <GroupedRow title="Email" trailing={<Text style={styles.value}>{me?.user?.email ?? "—"}</Text>} />
        <GroupedRow title="Gym" trailing={<Text style={styles.value}>{me?.tenant_name ?? "—"}</Text>} />
        <GroupedRow title="Role" trailing={<Text style={styles.value}>{me?.role_name ?? "—"}</Text>} />
        <GroupedRow title="Branch" trailing={<Text style={styles.value}>{me?.branches?.[0]?.name ?? "—"}</Text>} last />
      </GroupedList>
      <GroupedList header="SECURITY">
        <GroupedRow
          title="Change Password"
          chevron
          onPress={() => router.push("/(tabs)/more/settings-password")}
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
  value: { ...typeStyle.body, color: colors.secondary },
});
