import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme-context";
import { inlineTitleOptions, largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function MembersLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={stackScreenOptions(palette)}>
      <Stack.Screen name="index" options={{ title: "Members", ...largeTitleOptions }} />
      <Stack.Screen name="[id]" options={{ title: "Member", ...inlineTitleOptions }} />
    </Stack>
  );
}