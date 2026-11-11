import { Stack } from "expo-router";
import { inlineTitleOptions, largeTitleOptions, stackScreenOptions } from "@/ui/stack-options";

export default function MembersLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Members", ...largeTitleOptions }} />
      <Stack.Screen name="[id]" options={{ title: "Member", ...inlineTitleOptions }} />
    </Stack>
  );
}
